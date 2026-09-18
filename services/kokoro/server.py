"""Private, loopback-only Dora speech service. Run with Python 3.12.

Set KOKORO_API_TOKEN and optionally KOKORO_MODEL_DIR / KOKORO_PORT.
Only the Letria server should contact this service; browsers use /api/speech.
Text and generated audio are never persisted or written to logs.
"""
from __future__ import annotations

import hashlib
import hmac
import io
import json
import logging
import os
from pathlib import Path
import re
import socket
import threading
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable
import wave

from prosody import conservative_edge_bounds, delivery_chunks, missing_join_silence, pause_after, prepare_spoken_text, reading_chunks, voice_settings

VOICE = "pf_dora"
SAMPLE_RATE = 24_000
MAX_TEXT = 2_400
MAX_BODY = 16_384
MAX_AUDIO = 5 * 1024 * 1024
MAX_SECONDS = 90
MAX_CACHE = 16 * 1024 * 1024
MAX_CACHE_ITEMS = 8


class InvalidSpeech(ValueError):
    pass


def speech_chunks(text: str, limit: int = 240) -> list[str]:
    """Compatibility entry point for the conservative reading segmentation."""
    try:
        return reading_chunks(text, limit)
    except ValueError as error:
        raise InvalidSpeech(str(error)) from error


def checked_wav(data: bytes) -> bytes:
    if not isinstance(data, bytes) or len(data) > MAX_AUDIO:
        raise InvalidSpeech("Audio limit exceeded")
    try:
        with wave.open(io.BytesIO(data), "rb") as audio:
            valid = (
                audio.getnchannels() == 1
                and audio.getsampwidth() == 2
                and audio.getframerate() == SAMPLE_RATE
                and 0 < audio.getnframes() <= MAX_SECONDS * SAMPLE_RATE
                and len(audio.readframes(audio.getnframes())) == audio.getnframes() * 2
            )
    except (wave.Error, EOFError):
        valid = False
    if not valid:
        raise InvalidSpeech("Invalid audio output")
    return data


def load_synthesizer(model_dir: Path) -> Callable[[str, str, str], bytes]:
    # Keep third-party imports here so HTTP/unit tests need no model or packages.
    import numpy as np
    import onnxruntime as ort
    from kokoro_onnx import Kokoro

    options = ort.SessionOptions()
    options.intra_op_num_threads = max(1, min(os.cpu_count() or 1, 4))
    options.inter_op_num_threads = 1
    options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    options.log_severity_level = 3
    session = ort.InferenceSession(
        str(model_dir / "kokoro-v1.0.onnx"),
        sess_options=options,
        providers=["CPUExecutionProvider"],
    )
    kokoro = Kokoro.from_session(session, str(model_dir / "voices-v1.0.bin"))
    if VOICE not in kokoro.get_voices():
        raise RuntimeError("Dora voice is missing")

    def synthesize(text: str, profile: str = "reading", pace: str = "natural") -> bytes:
        settings = voice_settings(profile, pace)
        pieces = []
        total = 0
        chunks = delivery_chunks(text, settings)
        previous = None
        for index, chunk in enumerate(chunks):
            samples, rate = kokoro.create(
                prepare_spoken_text(chunk, settings), voice=VOICE, speed=settings.speed, lang="pt-br", trim=True,
                sentence_pause=settings.sentence_pause, clause_pause=settings.clause_pause,
                continuous=False,
            )
            if rate != SAMPLE_RATE:
                raise InvalidSpeech("Unsupported sample rate")
            samples = np.asarray(samples).reshape(-1)
            if not len(samples) or not np.isfinite(samples).all() or float(np.max(np.abs(samples))) <= 0.0005:
                raise InvalidSpeech("Invalid audio samples")
            start, end = conservative_edge_bounds(samples, rate)
            samples = samples[start:end]
            if previous is not None:
                # Native model pauses already occupy part of the boundary.
                # Add only what is missing, instead of stacking another fixed gap.
                silence = missing_join_silence(previous, samples, rate, pause_after(chunks[index - 1], settings))
                total += silence
                pieces.append(b"\x00\x00" * silence)
            total += len(samples)
            if total > MAX_SECONDS * SAMPLE_RATE:
                raise InvalidSpeech("Audio duration limit exceeded")
            pieces.append((np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes())
            previous = samples
        result = io.BytesIO()
        with wave.open(result, "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(SAMPLE_RATE)
            audio.writeframes(b"".join(pieces))
        return checked_wav(result.getvalue())

    return synthesize


class SpeechServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, address: tuple[str, int], token: str, synthesize: Callable[[str, str, str], bytes]):
        if address[0] != "127.0.0.1":
            raise ValueError("The speech service must bind to 127.0.0.1")
        if not token or len(token) < 32 or any(char.isspace() for char in token):
            raise ValueError("KOKORO_API_TOKEN must have at least 32 non-whitespace characters")
        self.token = token
        self.synthesize = synthesize
        self.synthesis_lock = threading.Lock()
        self.cache_lock = threading.Lock()
        self.cache: OrderedDict[str, bytes] = OrderedDict()
        self.cache_bytes = 0
        super().__init__(address, SpeechHandler)

    def cached(self, key: str) -> bytes | None:
        with self.cache_lock:
            data = self.cache.get(key)
            if data is not None:
                self.cache.move_to_end(key)
            return data

    def remember(self, key: str, data: bytes) -> None:
        with self.cache_lock:
            previous = self.cache.pop(key, None)
            if previous:
                self.cache_bytes -= len(previous)
            self.cache[key] = data
            self.cache_bytes += len(data)
            while len(self.cache) > MAX_CACHE_ITEMS or self.cache_bytes > MAX_CACHE:
                _, evicted = self.cache.popitem(last=False)
                self.cache_bytes -= len(evicted)


class SpeechHandler(BaseHTTPRequestHandler):
    server: SpeechServer
    server_version = "LetriaVoice"
    sys_version = ""

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, *_args: object) -> None:
        # Requests can contain text/token. Suppress the default request logger.
        pass

    def respond(self, status: int, payload: dict | bytes, media_type: str = "application/json") -> None:
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", media_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, private")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            pass

    def authorized(self) -> bool:
        host = self.headers.get_all("Host", [])
        allowed_hosts = {f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"}
        if len(host) != 1 or host[0].lower() not in allowed_hosts or self.headers.get_all("Origin"):
            self.respond(403, {"error": "Forbidden"})
            return False
        auth = self.headers.get_all("Authorization", [])
        expected = "Bearer " + self.server.token
        if len(auth) != 1 or not hmac.compare_digest(auth[0].encode("utf-8"), expected.encode("utf-8")):
            self.respond(401, {"error": "Unauthorized"})
            return False
        return True

    def do_GET(self) -> None:
        if not self.authorized():
            return
        if self.path != "/health":
            self.respond(404, {"error": "Not found"})
            return
        self.respond(200, {"status": "ready", "model": "kokoro", "voice": VOICE})

    def do_POST(self) -> None:
        if not self.authorized():
            return
        if self.path != "/v1/audio/speech":
            self.respond(404, {"error": "Not found"})
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            self.respond(415, {"error": "Expected application/json"})
            return
        lengths = self.headers.get_all("Content-Length", [])
        if self.headers.get_all("Transfer-Encoding") or len(lengths) != 1:
            self.respond(411, {"error": "Content-Length required"})
            return
        if not re.fullmatch(r"[0-9]{1,8}", lengths[0]) or not 0 < int(lengths[0]) <= MAX_BODY:
            self.respond(413, {"error": "Invalid body size"})
            return
        try:
            raw = self.rfile.read(int(lengths[0]))
            if len(raw) != int(lengths[0]):
                raise ValueError("Incomplete request")
            body = json.loads(raw.decode("utf-8"))
        except socket.timeout:
            self.respond(408, {"error": "Request timed out"})
            return
        except (ValueError, UnicodeError):
            self.respond(400, {"error": "Invalid JSON"})
            return
        if not isinstance(body, dict):
            self.respond(400, {"error": "Expected an object"})
            return
        text = body.get("input")
        if not isinstance(text, str) or not 1 <= len(text.strip()) <= MAX_TEXT:
            self.respond(400, {"error": "Input must contain between 1 and 2400 characters"})
            return
        if body.get("voice", VOICE) != VOICE or body.get("response_format", "wav") != "wav":
            self.respond(400, {"error": "Only Dora WAV output is supported"})
            return
        profile = body.get("profile", "reading")
        pace = body.get("pace", "natural")
        try:
            settings = voice_settings(profile, pace)
        except ValueError:
            self.respond(400, {"error": "Unknown speech profile or pace"})
            return
        text = text.strip()
        try:
            if not delivery_chunks(text, settings):
                raise InvalidSpeech("Nothing to synthesize")
            cache_input = json.dumps([VOICE, "warm-v1", profile, pace, text], ensure_ascii=False, separators=(",", ":"))
            key = hashlib.sha256(cache_input.encode("utf-8")).hexdigest()
        except (ValueError, UnicodeError):
            self.respond(400, {"error": "Invalid speech text"})
            return
        cached = self.server.cached(key)
        if cached is not None:
            self.respond(200, cached, "audio/wav")
            return
        if not self.server.synthesis_lock.acquire(blocking=False):
            self.respond(503, {"error": "Speech service is busy"})
            return
        try:
            audio = checked_wav(self.server.synthesize(text, profile, pace))
            self.server.remember(key, audio)
            self.respond(200, audio, "audio/wav")
        except InvalidSpeech:
            self.respond(422, {"error": "Text cannot be synthesized within the audio limit"})
        except Exception:
            # Never include third-party exceptions; they may embed user text.
            self.respond(503, {"error": "Speech temporarily unavailable"})
        finally:
            self.server.synthesis_lock.release()

    def do_OPTIONS(self) -> None:
        self.respond(403, {"error": "Browser access is not allowed"})


def main() -> None:
    logging.disable(logging.CRITICAL)
    token = os.environ.get("KOKORO_API_TOKEN", "")
    if len(token) < 32 or any(char.isspace() for char in token):
        raise SystemExit("Configure KOKORO_API_TOKEN with at least 32 non-whitespace characters.")
    model_dir = Path(os.environ.get("KOKORO_MODEL_DIR", Path(__file__).parent / "models"))
    try:
        port = int(os.environ.get("KOKORO_PORT", "8765"))
        if not 1 <= port <= 65535:
            raise ValueError("Invalid port")
        synthesize = load_synthesizer(model_dir)
        server = SpeechServer(("127.0.0.1", port), token, synthesize)
    except Exception:
        raise SystemExit("Could not start Dora. Check model files, Python dependencies and the local port.") from None
    print(f"Dora ready on http://127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
