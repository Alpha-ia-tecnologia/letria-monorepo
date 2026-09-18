"""Private Qwen3-TTS service. Only Letria's server may call it.

The runtime reads installed weights; model downloads belong to explicit setup.
Text and tokens are never logged. Only explicitly prepared catalogue audio is
persisted in the private, bounded store; free conversation stays in RAM.
"""
from __future__ import annotations

from collections import OrderedDict, deque
import base64
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import io
import logging
import os
from pathlib import Path
import re
import select
import socket
import threading
import time
from typing import Callable, Mapping
import wave

from audio_store import AudioStore, audio_key
from preparation import PreparationBusy, PreparationQueue, PreparationUnavailable

from synthesis import (
    DESIGN_SEED, DESIGN_VERSION, GENERATION_SECONDS, MODEL_ID, MODEL_REVISION, VOICE,
    GenerationControl, InvalidSpeech, SpeechCancelled, SpeechTimeout, checked_wav, MAX_SECONDS, SAMPLE_RATE,
    load_synthesizer, validate_request,
)

MAX_BODY = 16_384
MAX_CACHE = 16 * 1024 * 1024
MAX_CACHE_ITEMS = 8
MAX_PENDING = 2
QUEUE_WAIT_SECONDS = 15
CANCEL_TTL_SECONDS = 190
MAX_CANCELLED_IDS = 256


class SpeechBusy(RuntimeError):
    pass


def allowed_host_names(value: str) -> frozenset[str]:
    """Accept exact HTTP Host authorities, never wildcards, URLs or credentials."""
    if not isinstance(value, str):
        raise ValueError("QWEN_TTS_ALLOWED_HOSTS must be a comma-separated list of exact hosts.")
    if not value.strip():
        return frozenset()
    entries = value.split(",")
    if len(entries) > 32:
        raise ValueError("QWEN_TTS_ALLOWED_HOSTS accepts at most 32 exact hosts.")
    result = set()
    for entry in entries:
        host = entry.strip().lower()
        match = re.fullmatch(r"(?:[a-z0-9_][a-z0-9_.-]*|\[::1\])(?::([0-9]{1,5}))?", host, re.ASCII)
        if not match or len(host) > 260 or ".." in host or (match[1] is not None and not 1 <= int(match[1]) <= 65535):
            raise ValueError("QWEN_TTS_ALLOWED_HOSTS must contain exact hostnames with optional ports; URLs and wildcards are not allowed.")
        result.add(host)
    return frozenset(result)


def validate_binding(host: str, allowed_hosts: frozenset[str]) -> None:
    if host not in ("127.0.0.1", "0.0.0.0"):
        raise ValueError("QWEN_TTS_HOST must be 127.0.0.1 or explicitly 0.0.0.0 for a private container network.")
    if host == "0.0.0.0" and not allowed_hosts:
        raise ValueError("Set QWEN_TTS_ALLOWED_HOSTS explicitly when QWEN_TTS_HOST is 0.0.0.0.")


def voice_configuration(environment: Mapping[str, str] | None = None) -> dict:
    settings = os.environ if environment is None else environment
    token = settings.get("QWEN_TTS_API_TOKEN", "")
    if len(token) < 32 or any(char.isspace() for char in token):
        raise ValueError("Configure QWEN_TTS_API_TOKEN with at least 32 non-whitespace characters.")
    host = settings.get("QWEN_TTS_HOST", "127.0.0.1").strip()
    allowed_hosts = allowed_host_names(settings.get("QWEN_TTS_ALLOWED_HOSTS", ""))
    validate_binding(host, allowed_hosts)
    try:
        port = int(settings.get("QWEN_TTS_PORT", "8766"))
        if not 1 <= port <= 65535:
            raise ValueError()
    except (TypeError, ValueError):
        raise ValueError("QWEN_TTS_PORT must be an integer from 1 to 65535.") from None
    device = settings.get("QWEN_TTS_DEVICE", "auto").strip().lower()
    if device not in ("auto", "cpu", "cuda"):
        raise ValueError("QWEN_TTS_DEVICE must be auto, cpu or cuda.")
    service_dir = Path(__file__).resolve().parent
    model_dir = Path(settings.get("QWEN_TTS_MODEL_DIR") or service_dir / "models/voice-design").resolve()
    reference_dir = Path(settings.get("QWEN_TTS_REFERENCE_DIR") or model_dir.parent.parent / "voices/lumi").resolve()
    cache_dir = Path(settings.get("QWEN_TTS_CACHE_DIR") or service_dir / "cache/prepared").resolve()
    return {"host": host, "port": port, "allowed_hosts": allowed_hosts, "token": token,
            "model_dir": model_dir, "reference_dir": reference_dir, "cache_dir": cache_dir, "device": device}


def request_identifier(body: dict, required: bool = False) -> str | None:
    if "request_id" not in body and not required:
        return None
    value = body.get("request_id")
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        raise ValueError("Invalid request identifier")
    return value.lower()


class SpeechServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, address: tuple[str, int], token: str, synthesize: Callable, device: str, store_dir: Path | None = None, allowed_hosts: frozenset[str] | None = None):
        configured_hosts = allowed_host_names(",".join(allowed_hosts or ()))
        validate_binding(address[0], configured_hosts)
        if not isinstance(token, str) or len(token) < 32 or any(char.isspace() for char in token):
            raise ValueError("QWEN_TTS_API_TOKEN must contain at least 32 non-whitespace characters")
        if device not in ("cuda", "cpu"):
            raise ValueError("Unknown speech device")
        self.token, self.synthesize, self.device = token, synthesize, device
        self.synthesis_lock = threading.Lock()
        self.queue_condition = threading.Condition()
        self.pending: deque[object] = deque()
        self.cancelled_ids: OrderedDict[str, float] = OrderedDict()
        self.request_events: dict[str, set[threading.Event]] = {}
        self.clock = time.monotonic
        self.cache_lock = threading.Lock()
        self.stop_event = threading.Event()
        self.cache: OrderedDict[str, bytes] = OrderedDict()
        self.cache_bytes = 0
        self.store = AudioStore(store_dir) if store_dir is not None else None
        self.preparation: PreparationQueue | None = None
        super().__init__(address, SpeechHandler)
        self.allowed_hosts = configured_hosts | {f"127.0.0.1:{self.server_port}", f"localhost:{self.server_port}"}
        if self.store is not None:
            self.preparation = PreparationQueue(self)

    def audio_key(self, text: str, profile: str, pace: str) -> str:
        identity = getattr(self.synthesize, "cache_identity", [MODEL_ID, MODEL_REVISION, DESIGN_VERSION, DESIGN_SEED, VOICE])
        return audio_key(identity, text, profile, pace)

    def cached(self, key: str) -> bytes | None:
        with self.cache_lock:
            data = self.cache.get(key)
            if data is not None:
                self.cache.move_to_end(key)
            if data is not None:
                return data
        return self.store.get(key) if self.store is not None else None

    def remember(self, key: str, data: bytes) -> None:
        with self.cache_lock:
            previous = self.cache.pop(key, None)
            if previous is not None:
                self.cache_bytes -= len(previous)
            self.cache[key] = data
            self.cache_bytes += len(data)
            while len(self.cache) > MAX_CACHE_ITEMS or self.cache_bytes > MAX_CACHE:
                _, evicted = self.cache.popitem(last=False)
                self.cache_bytes -= len(evicted)

    def forget(self, key: str, audio: bytes) -> None:
        with self.cache_lock:
            if self.cache.get(key) is audio:
                self.cache_bytes -= len(self.cache.pop(key))

    def prune_cancellations(self) -> None:
        # Called with queue_condition held. Only opaque IDs and expiry times.
        now = self.clock()
        expired = [key for key, expires in self.cancelled_ids.items() if expires <= now]
        for key in expired:
            del self.cancelled_ids[key]

    def register_request(self, request_id: str | None) -> threading.Event:
        event = threading.Event()
        if request_id is not None:
            with self.queue_condition:
                self.prune_cancellations()
                if request_id in self.cancelled_ids:
                    event.set()
                self.request_events.setdefault(request_id, set()).add(event)
        return event

    def unregister_request(self, request_id: str | None, event: threading.Event) -> None:
        if request_id is not None:
            with self.queue_condition:
                events = self.request_events.get(request_id)
                if events is not None:
                    events.discard(event)
                    if not events:
                        del self.request_events[request_id]

    def cancel_request(self, request_id: str) -> None:
        with self.queue_condition:
            self.prune_cancellations()
            self.cancelled_ids[request_id] = self.clock() + CANCEL_TTL_SECONDS
            self.cancelled_ids.move_to_end(request_id)
            while len(self.cancelled_ids) > MAX_CANCELLED_IDS:
                self.cancelled_ids.popitem(last=False)
            # Active/queued events remain cancelled even if a tombstone is evicted.
            for event in self.request_events.get(request_id, ()):
                event.set()
            self.queue_condition.notify_all()

    def acquire_turn(self, control: GenerationControl) -> None:
        with self.queue_condition:
            control.check()
            if self.preparation is not None:
                self.preparation.preempt.set()
            if not self.pending and self.synthesis_lock.acquire(blocking=False):
                return
            if len(self.pending) >= MAX_PENDING:
                raise SpeechBusy()
            ticket = object()
            self.pending.append(ticket)
            wait_until = min(control.deadline, control.clock() + QUEUE_WAIT_SECONDS)
            try:
                while True:
                    control.check()
                    remaining = wait_until - control.clock()
                    if remaining <= 0:
                        raise SpeechBusy()
                    if self.pending[0] is ticket and self.synthesis_lock.acquire(blocking=False):
                        self.pending.popleft()
                        return
                    self.queue_condition.wait(timeout=min(0.1, remaining))
            finally:
                if ticket in self.pending:
                    self.pending.remove(ticket)
                self.queue_condition.notify_all()

    def release_turn(self) -> None:
        with self.queue_condition:
            self.synthesis_lock.release()
            self.queue_condition.notify_all()

    def handle_error(self, _request, _client_address) -> None:
        # Never let framework tracebacks disclose request or generation data.
        pass

    def server_close(self) -> None:
        self.stop_event.set()
        with self.queue_condition:
            for events in self.request_events.values():
                for event in events:
                    event.set()
            self.cancelled_ids.clear()
            self.queue_condition.notify_all()
        with self.cache_lock:
            self.cache.clear()
            self.cache_bytes = 0
        if self.preparation is not None:
            self.preparation.close()
        super().server_close()


class SpeechHandler(BaseHTTPRequestHandler):
    server: SpeechServer
    server_version = "LetriaVoice"
    sys_version = ""

    def setup(self) -> None:
        super().setup()
        self.connection.settimeout(5)

    def log_message(self, *_args: object) -> None:
        pass

    def client_left(self) -> bool:
        if self.server.stop_event.is_set():
            return True
        try:
            readable, _, _ = select.select([self.connection], [], [], 0)
            return bool(readable) and self.connection.recv(1, socket.MSG_PEEK) == b""
        except (OSError, ValueError):
            return True

    def respond(self, status: int, payload: dict | bytes, media_type: str = "application/json", retry_after: int | None = None) -> None:
        body = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("Content-Type", media_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store, private")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            if retry_after is not None:
                self.send_header("Retry-After", str(retry_after))
            self.end_headers()
            self.wfile.write(body)
        except OSError:
            pass
        finally:
            self.close_connection = True

    def authorized(self) -> bool:
        host = self.headers.get_all("Host", [])
        if len(host) != 1 or host[0].lower() not in self.server.allowed_hosts or self.headers.get_all("Origin"):
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
        match = re.fullmatch(r"/v1/audio/prepare/([0-9a-f]{32})", self.path)
        if match:
            status = self.server.preparation.status(match[1]) if self.server.preparation is not None else None
            self.respond(200 if status else 404, status or {"error": "Not found"})
            return
        if self.path != "/health":
            self.respond(404, {"error": "Not found"})
            return
        self.respond(200, {"status": "ready", "model": "qwen3-tts", "voice": VOICE, "device": self.server.device,
                           "fixed_voice": bool(getattr(self.server.synthesize, "voice_ready", False)),
                           "streaming": bool(getattr(self.server.synthesize, "streaming", False)),
                           "preparation": {"enabled": self.server.preparation is not None,
                                           "pending": self.server.preparation.pending_count() if self.server.preparation else 0}})

    def do_POST(self) -> None:
        if not self.authorized():
            return
        if self.path not in ("/v1/audio/speech", "/v1/audio/cancel", "/v1/audio/prepare"):
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
        if self.path == "/v1/audio/prepare":
            if self.server.preparation is None:
                self.respond(503, {"error": "Preparation unavailable", "code": "PREPARATION_UNAVAILABLE"})
                return
            try:
                if set(body) != {"items"}:
                    raise ValueError("Invalid preparation batch")
                job = self.server.preparation.submit(body.get("items"))
                self.respond(202, job)
            except ValueError:
                self.respond(400, {"error": "Invalid preparation batch"})
            except PreparationBusy:
                self.respond(503, {"error": "Preparation queue is full", "code": "PREPARATION_BUSY"}, retry_after=5)
            except PreparationUnavailable:
                self.respond(503, {"error": "Preparation could not be saved", "code": "PREPARATION_UNAVAILABLE"}, retry_after=5)
            return
        try:
            request_id = request_identifier(body, required=self.path == "/v1/audio/cancel")
        except ValueError:
            self.respond(400, {"error": "Invalid request identifier"})
            return
        if self.path == "/v1/audio/cancel":
            self.server.cancel_request(request_id)
            # Idempotent acknowledgement, without exposing whether an ID exists.
            self.respond(200, {"ok": True})
            return
        output_format = body.get("response_format", "wav")
        if body.get("voice", VOICE) != VOICE or output_format not in ("wav", "pcm_stream"):
            self.respond(400, {"error": "Unsupported Lumi output format"})
            return
        try:
            text, profile, pace = validate_request(body.get("input"), body.get("profile", "reading"), body.get("pace", "natural"))
            key = self.server.audio_key(text, profile, pace)
        except (ValueError, UnicodeError):
            self.respond(400, {"error": "Invalid speech request"})
            return
        # One fixed budget includes queueing, generation and final validation.
        deadline = self.server.clock() + GENERATION_SECONDS
        cancelled = self.server.register_request(request_id)
        control = GenerationControl(deadline, cancelled=lambda: cancelled.is_set() or self.client_left(), clock=self.server.clock)
        generated: bytes | None = None
        self.stream_started = False
        try:
            control.check()
            audio = self.server.cached(key)
            if output_format == "pcm_stream" and audio is None and not getattr(self.server.synthesize, "streaming", False):
                self.respond(400, {"error": "Streaming unavailable", "code": "STREAMING_UNAVAILABLE"})
                return
            if audio is None:
                self.server.acquire_turn(control)
                try:
                    control.check()
                    # A previous equal request may have filled the cache while we waited.
                    audio = self.server.cached(key)
                    if audio is None:
                        if output_format == "pcm_stream":
                            output = self.generate_stream(text, profile, pace, control)
                        else:
                            output = self.server.synthesize(text, profile, pace, control)
                        control.check()
                        audio = checked_wav(output)
                        generated = audio
                        # Serialize cancellation with acceptance of completed audio.
                        with self.server.queue_condition:
                            control.check()
                            self.server.remember(key, audio)
                finally:
                    self.server.release_turn()
            control.check()
            # Completed/cache audio is sent after releasing the synthesis slot.
            if output_format == "pcm_stream":
                if not self.stream_started:
                    self.stream_wav(audio, control)
                self.stream_event({"type": "end"})
            else:
                self.respond(200, audio, "audio/wav")
        except SpeechBusy:
            self.speech_failure(503, "SPEECH_BUSY", "Speech service is busy", retry_after=2)
        except SpeechTimeout:
            if generated is not None:
                self.server.forget(key, generated)
            self.speech_failure(504, "SPEECH_TIMEOUT", "Speech generation timed out")
        except SpeechCancelled:
            if generated is not None:
                self.server.forget(key, generated)
            if not self.client_left():
                self.speech_failure(409, "SPEECH_CANCELLED", "Speech generation cancelled")
            self.close_connection = True
        except InvalidSpeech:
            self.speech_failure(422, "SPEECH_INVALID", "Speech could not be completed within its limits")
        except Exception:
            # Model exceptions can embed prompt text. Keep the response generic.
            self.speech_failure(503, "SPEECH_UNAVAILABLE", "Speech temporarily unavailable")
        finally:
            self.close_connection = True
            self.server.unregister_request(request_id, cancelled)

    def stream_event(self, event: dict) -> None:
        if not self.stream_started:
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Cache-Control", "no-store, private")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Connection", "close")
            self.end_headers()
            self.stream_started = True
        self.wfile.write(json.dumps(event, separators=(",", ":")).encode("ascii") + b"\n")
        self.wfile.flush()

    def speech_failure(self, status: int, code: str, message: str, retry_after: int | None = None) -> None:
        if self.stream_started:
            try:
                self.stream_event({"type": "error", "code": code})
            except OSError:
                pass
        else:
            self.respond(status, {"error": message, "code": code}, retry_after=retry_after)

    def send_pcm(self, data: bytes, control: GenerationControl) -> None:
        if not self.stream_started:
            self.stream_event({"type": "start", "sampleRate": SAMPLE_RATE, "channels": 1, "encoding": "pcm_s16le", "bufferUntilEnd": getattr(self, "buffer_until_end", False)})
        for offset in range(0, len(data), 48_000):
            control.check()
            self.stream_event({"type": "audio", "data": base64.b64encode(data[offset:offset + 48_000]).decode("ascii")})

    def stream_wav(self, data: bytes, control: GenerationControl) -> None:
        checked_wav(data)
        with wave.open(io.BytesIO(data), "rb") as audio:
            self.send_pcm(audio.readframes(audio.getnframes()), control)

    def generate_stream(self, text: str, profile: str, pace: str, control: GenerationControl) -> bytes:
        self.buffer_until_end = True
        chunks = self.server.synthesize.synthesize_stream(text, profile, pace, control)
        pcm = bytearray()
        try:
            for chunk in chunks:
                control.check()
                if not isinstance(chunk, bytes) or not chunk or len(chunk) % 2:
                    raise InvalidSpeech("Invalid PCM output")
                if len(pcm) + len(chunk) > MAX_SECONDS * SAMPLE_RATE * 2:
                    raise InvalidSpeech("Audio duration limit exceeded")
                pcm.extend(chunk)
                self.send_pcm(chunk, control)
            control.check()
        finally:
            close = getattr(chunks, "close", None)
            if close is not None:
                close()
        if not pcm:
            raise InvalidSpeech("Empty PCM output")
        target = io.BytesIO()
        with wave.open(target, "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(SAMPLE_RATE)
            audio.writeframes(pcm)
        return checked_wav(target.getvalue())

    def do_OPTIONS(self) -> None:
        self.respond(403, {"error": "Browser access is not allowed"})


def main() -> None:
    logging.disable(logging.CRITICAL)
    try:
        settings = voice_configuration()
    except ValueError as error:
        raise SystemExit(str(error)) from None
    if not (settings["model_dir"] / "config.json").is_file() or not (settings["model_dir"] / "model.safetensors").is_file():
        raise SystemExit("Installed model files are missing. Provision the model volume and set QWEN_TTS_MODEL_DIR; startup never downloads weights.")
    try:
        synthesize, device = load_synthesizer(settings["model_dir"], settings["device"], reference_dir=settings["reference_dir"])
    except Exception:
        raise SystemExit("Could not load Lumi voice. Check the installed model, the original reference WAV/JSON and the selected CPU/CUDA runtime.") from None
    try:
        server = SpeechServer((settings["host"], settings["port"]), settings["token"], synthesize, device,
                              settings["cache_dir"], allowed_hosts=settings["allowed_hosts"])
    except Exception:
        raise SystemExit("Could not start Lumi voice. Check the listening port and write permissions on QWEN_TTS_CACHE_DIR.") from None
    print(f"Lumi voice ready on port {settings['port']} ({device})", flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
