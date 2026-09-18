"""Offline Qwen speech using Lumi's own saved, synthetic voice reference.

Base reuses one prompt extracted at startup. Its codec frames are decoded while
its talker is still generating; non_streaming_mode alone cannot do that.
VoiceDesign remains available explicitly for creating a new original persona.
"""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import io
import hashlib
import json
import os
from pathlib import Path
import re
from queue import Empty, Full, Queue
from threading import Event, Thread
import time
from typing import Callable, Iterator
import wave

MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
MODEL_REVISION = "5ecdb67327fd37bb2e042aab12ff7391903235d3"
BASE_MODEL_ID = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
BASE_MODEL_REVISION = "fd4b254389122332181a7c3db7f27e918eec64e3"
FIXED_VERSION = "lumi-fixed-voice-pcm-v2"
VOICE = "lumi"
DESIGN_VERSION = "lumi-voice-design-v1"
DESIGN_SEED = 20260917
SAMPLE_RATE = 24_000
MAX_TEXT = 2_400
MAX_AUDIO = 5 * 1024 * 1024
MAX_SECONDS = 90
MAX_NEW_TOKENS = 1024
GENERATION_SECONDS = 170
STREAM_FIRST_FRAMES = 6
STREAM_NEXT_FRAMES = 12
STREAM_CONTEXT_FRAMES = 300
CODEC_SAMPLES = 1920
GENERATION_OPTIONS = {
    "max_new_tokens": MAX_NEW_TOKENS, "do_sample": True, "top_k": 50,
    "top_p": 0.9, "temperature": 0.8, "repetition_penalty": 1.05,
    "subtalker_dosample": True, "subtalker_top_k": 50,
    "subtalker_top_p": 0.9, "subtalker_temperature": 0.8,
}

PERSONA = (
    "An original fictional feminine, youthful and childlike voice for Lumi, a friendly little owl. "
    "A warm, sweet, light and softly bright timbre, with a natural Brazilian Portuguese accent. "
    "Clear pronunciation, gentle curiosity and a reassuring audible smile. "
    "Expressive but subtle sentence intonation, comfortable breath and meaningful short pauses. "
    "Keep the voice natural, never squeaky, shrill, exaggerated, robotic, whispered or sung. "
    "A kind companion speaking directly to a child. Clean studio speech without music or sound effects. "
)


class InvalidSpeech(ValueError):
    pass


class SpeechCancelled(RuntimeError):
    pass


class SpeechTimeout(SpeechCancelled):
    pass


@dataclass
class GenerationControl:
    deadline: float
    cancelled: Callable[[], bool] = lambda: False
    clock: Callable[[], float] = time.monotonic

    def check(self) -> None:
        if self.cancelled():
            raise SpeechCancelled("Speech request cancelled")
        if self.clock() >= self.deadline:
            raise SpeechTimeout("Speech generation deadline exceeded")


def validate_request(text: object, profile: object = "reading", pace: object = "natural") -> tuple[str, str, str]:
    if not isinstance(text, str) or not 1 <= len(text.strip()) <= MAX_TEXT:
        raise InvalidSpeech("Input must contain between 1 and 2400 characters")
    if profile not in ("reading", "conversation") or pace not in ("natural", "calm"):
        raise InvalidSpeech("Unknown speech profile or pace")
    text = text.strip()
    try:
        text.encode("utf-8")
    except UnicodeError as error:
        raise InvalidSpeech("Invalid speech text") from error
    if any(ord(char) < 32 and char not in "\n\r\t" for char in text) or re.search(r"<\|[^>]*\|>", text):
        raise InvalidSpeech("Invalid speech text")
    if any(len(word) > 240 for word in text.split()):
        raise InvalidSpeech("Text contains a word that is too long")
    return text, str(profile), str(pace)


def prepare_spoken_text(text: str, profile: str) -> str:
    return re.sub(r"\bLumi\b", "Lúmi", text) if profile == "conversation" else text


def voice_instruction(profile: str, pace: str) -> str:
    if profile not in ("reading", "conversation") or pace not in ("natural", "calm"):
        raise InvalidSpeech("Unknown speech profile or pace")
    delivery = (
        "Use friendly conversational phrasing and a gentle smile. Let questions sound curious. "
        if profile == "conversation" else
        "Use patient educational narration. Preserve the written words, letters and separated syllables exactly. "
        "Make every syllable intelligible, without adding spoken explanations or spelling ordinary words. "
    )
    rhythm = (
        "Speak at a slightly slower, calm and relaxed pace, without stretching vowels or adding long silences."
        if pace == "calm" else
        "Speak at a comfortable natural pace, with a smooth rhythm and no rushing."
    )
    return PERSONA + delivery + rhythm


def checked_wav(data: bytes) -> bytes:
    if not isinstance(data, bytes) or len(data) > MAX_AUDIO:
        raise InvalidSpeech("Audio limit exceeded")
    try:
        with wave.open(io.BytesIO(data), "rb") as audio:
            frames = audio.getnframes()
            valid = (audio.getnchannels() == 1 and audio.getsampwidth() == 2 and audio.getframerate() == SAMPLE_RATE
                     and 0 < frames <= MAX_SECONDS * SAMPLE_RATE and len(audio.readframes(frames)) == frames * 2)
    except (wave.Error, EOFError):
        valid = False
    if not valid:
        raise InvalidSpeech("Invalid audio output")
    return data


def require_finished_sequence(result: object, eos_id: int) -> None:
    """A bounded generation is usable only when it reached the model's EOS."""
    sequences = getattr(result, "sequences", None)
    if sequences is None or len(sequences) != 1 or len(sequences[0]) == 0:
        raise InvalidSpeech("Speech completion could not be verified")
    final_token = sequences[0][-1]
    value = int(final_token.item() if hasattr(final_token, "item") else final_token)
    if value != eos_id:
        raise InvalidSpeech("Speech reached its generation limit before completion")


@contextmanager
def guarded_talker(model: object, control: GenerationControl, criteria_factory: Callable[[GenerationControl], object]) -> Iterator[None]:
    """Guard the instance, not package files: Qwen 0.1.1 drops extra kwargs.

    The enclosing service permits one synthesis at a time. Inject stopping
    criteria at the actual Hugging Face talker and reject a missing EOS before
    reporting success. Live streaming may already have emitted partial PCM;
    callers must send an error, never cache/mark that incomplete stream done.
    """
    talker = model.model.talker
    original = talker.generate
    had_override = "generate" in vars(talker)
    previous_override = vars(talker).get("generate")
    eos_id = int(model.model.config.talker_config.codec_eos_token_id)

    def generate(*args, **kwargs):
        control.check()
        kwargs["max_new_tokens"] = min(MAX_NEW_TOKENS, max(2, int(kwargs.get("max_new_tokens", MAX_NEW_TOKENS))))
        kwargs["stopping_criteria"] = criteria_factory(control)
        kwargs["max_time"] = max(0.01, control.deadline - control.clock())
        result = original(*args, **kwargs)
        control.check()
        require_finished_sequence(result, eos_id)
        return result

    talker.generate = generate
    try:
        yield
    finally:
        if had_override:
            talker.generate = previous_override
        else:
            delattr(talker, "generate")


@dataclass(frozen=True)
class VoiceReference:
    path: Path
    text: str | None
    sha256: str
    x_vector_only: bool = False


def load_voice_reference(folder: Path) -> VoiceReference:
    """Only the preselected local synthetic recording is accepted, never a URL."""
    try:
        metadata = json.loads((folder / "reference.json").read_text(encoding="utf-8"))
        if not isinstance(metadata, dict) or metadata.get("provenance") != "qwen-voice-design-original":
            raise ValueError("Unknown reference provenance")
        path = folder / "reference.wav"
        if not path.is_file() or path.stat().st_size > MAX_AUDIO:
            raise ValueError("Missing reference audio")
        data = checked_wav(path.read_bytes())
        digest = hashlib.sha256(data).hexdigest()
        if metadata.get("sha256") != digest:
            raise ValueError("Reference audio checksum differs")
        embedding_only = metadata.get("x_vector_only_mode") is True
        if embedding_only and metadata.get("text") is not None:
            raise ValueError("Embedding-only references must not contain an unverified transcript")
        text = None if embedding_only else validate_request(metadata.get("text"))[0]
        return VoiceReference(path.resolve(), text, digest, embedding_only)
    except (OSError, ValueError, TypeError) as error:
        raise RuntimeError("Lumi's fixed voice reference is missing or invalid") from error


def pcm_wav(pcm: bytes) -> bytes:
    if not isinstance(pcm, bytes) or not pcm or len(pcm) % 2:
        raise InvalidSpeech("Invalid PCM output")
    result = io.BytesIO()
    with wave.open(result, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)
        audio.writeframes(pcm)
    return checked_wav(result.getvalue())


class CodecWindowEmitter:
    """Bounded causal decode retaining up to 24 seconds of preceding audio.

    Short replies retain their full causal history. The official 25-frame
    overlap is intended for large chunks, and audibly alters small PCM blocks.
    Our maximum 312-frame window remains below the official decoder's 325.
    decode receives history plus new codec frames and returns PCM for all those
    frames. Only new samples are emitted, preserving exact frame boundaries.
    The final remainder is emitted only after the talker's EOS was validated.
    """
    def __init__(self, decode: Callable, emit: Callable[[bytes], None], control: GenerationControl,
                 reference_frames: list | None = None):
        self.decode, self.emit, self.control = decode, emit, control
        self.history = list(reference_frames or [])[-STREAM_CONTEXT_FRAMES:]
        self.pending: list = []
        self.frames = 0
        self.blocks = 0
        self.audible = False

    def add(self, frame: object):
        self.control.check()
        self.frames += 1
        if self.frames * CODEC_SAMPLES > MAX_SECONDS * SAMPLE_RATE:
            raise InvalidSpeech("Audio duration limit exceeded")
        self.pending.append(frame)
        target = STREAM_NEXT_FRAMES if self.blocks else STREAM_FIRST_FRAMES
        if len(self.pending) >= target:
            self.flush()

    def flush(self):
        if not self.pending:
            return
        self.control.check()
        frames = self.history + self.pending
        pcm = self.decode(frames)
        expected = len(frames) * CODEC_SAMPLES * 2
        if not isinstance(pcm, bytes) or len(pcm) != expected:
            raise InvalidSpeech("Codec output does not match its frame boundaries")
        fresh = pcm[len(self.history) * CODEC_SAMPLES * 2:]
        # Digital silence is allowed between words; the whole utterance must be audible.
        self.audible = self.audible or any(fresh)
        self.control.check()
        self.emit(fresh)
        self.history = frames[-STREAM_CONTEXT_FRAMES:]
        self.pending = []
        self.blocks += 1

    def finish(self):
        self.flush()
        if not self.frames or not self.audible:
            raise InvalidSpeech("Invalid audio samples")


def threaded_pcm_stream(produce: Callable, control: GenerationControl) -> Iterator[bytes]:
    """Bounded producer queue; closing the iterator stops and joins inference.

    Joining before return is deliberate: the server must not release its single
    GPU slot while a cancelled generation is still using the talker hooks.
    """
    stop = Event()
    queue = Queue(maxsize=4)
    local = GenerationControl(control.deadline, lambda: stop.is_set() or control.cancelled(), control.clock)

    def put(item):
        while True:
            local.check()
            try:
                queue.put(item, timeout=0.05)
                return
            except Full:
                continue

    def run():
        try:
            produce(lambda pcm: put(("pcm", pcm)), local)
            put(("end", None))
        except BaseException as error:
            # Cancellation is detected by the consumer too. Never wait forever
            # trying to publish an error to a queue whose reader has gone away.
            while not stop.is_set():
                try:
                    queue.put(("error", error), timeout=0.05)
                    return
                except Full:
                    if control.cancelled() or control.clock() >= control.deadline:
                        return

    control.check()
    worker = Thread(target=run, name="lumi-qwen-pcm", daemon=True)
    worker.start()
    try:
        while True:
            control.check()
            try:
                kind, value = queue.get(timeout=0.1)
            except Empty:
                continue
            if kind == "end":
                return
            if kind == "error":
                raise value
            yield value
    finally:
        stop.set()
        worker.join()


def generation_identity(device: str) -> dict:
    """Every configurable generation/decoder input participates in disk keys."""
    return {
        "seed": DESIGN_SEED, "sampling": dict(GENERATION_OPTIONS),
        "precision": "bfloat16" if device == "cuda" else "float32",
        "attention": "sdpa", "sample_rate": SAMPLE_RATE,
        "full_decoder": "qwen-official",
        "stream_decoder": {"first_frames": STREAM_FIRST_FRAMES, "next_frames": STREAM_NEXT_FRAMES,
                           "context_frames": STREAM_CONTEXT_FRAMES, "samples_per_frame": CODEC_SAMPLES},
    }


def waveform_pcm(wavs, rate, np) -> bytes:
    if rate != SAMPLE_RATE or not isinstance(wavs, (list, tuple)) or len(wavs) != 1:
        raise InvalidSpeech("Unsupported audio output")
    samples = np.asarray(wavs[0])
    if samples.ndim != 1 or not 0 < len(samples) <= MAX_SECONDS * SAMPLE_RATE:
        raise InvalidSpeech("Audio duration limit exceeded")
    if not np.isfinite(samples).all() or float(np.max(np.abs(samples))) <= 0.0001:
        raise InvalidSpeech("Invalid audio samples")
    return (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()


def build_fixed_synthesizer(model, reference: VoiceReference, device: str, torch, np, criteria_factory):
    """Extract once, reuse immutable reference features for every utterance."""
    with torch.inference_mode():
        prompt = model.create_voice_clone_prompt(
            ref_audio=str(reference.path), ref_text=reference.text, x_vector_only_mode=reference.x_vector_only,
        )
    if len(prompt) != 1 or bool(prompt[0].x_vector_only_mode) != reference.x_vector_only:
        raise RuntimeError("Could not prepare Lumi's fixed voice")
    if not reference.x_vector_only and (prompt[0].ref_code is None or not prompt[0].icl_mode):
        raise RuntimeError("Could not prepare Lumi's reference transcript")
    ref_frames = [] if reference.x_vector_only else list(prompt[0].ref_code[-STREAM_CONTEXT_FRAMES:].split(1, dim=0))
    if model.model.speech_tokenizer.get_decode_upsample_rate() != CODEC_SAMPLES:
        raise RuntimeError("Unsupported Qwen audio tokenizer")
    eos_id = int(model.model.config.talker_config.codec_eos_token_id)

    def generate(text, profile, pace, emit, control):
        control.check()
        def decode(frames):
            control.check()
            codes = torch.cat(frames, dim=0)
            wavs, rate = model.model.speech_tokenizer.decode([{"audio_codes": codes}])
            if rate != SAMPLE_RATE or len(wavs) != 1:
                raise InvalidSpeech("Unsupported audio output")
            samples = np.asarray(wavs[0])
            if samples.ndim != 1 or not np.isfinite(samples).all():
                raise InvalidSpeech("Invalid audio samples")
            control.check()
            return (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()

        with torch.inference_mode(), torch.random.fork_rng(devices=[0] if device == "cuda" else []):
            torch.manual_seed(DESIGN_SEED)
            if device == "cuda":
                torch.cuda.manual_seed_all(DESIGN_SEED)
            collector = CodecWindowEmitter(decode, emit, control, ref_frames)
            def capture(_module, _args, output):
                control.check()
                hidden = getattr(output, "hidden_states", None)
                codes = hidden[-1] if hidden else None
                if codes is None:  # Prefill has no audio frame.
                    return
                if codes.ndim != 2 or codes.shape != (1, 16):
                    raise InvalidSpeech("Unsupported Qwen codec output")
                if int(codes[0, 0].item()) == eos_id:
                    return
                collector.add(codes.detach())

            hook = model.model.talker.register_forward_hook(capture)
            try:
                # Mirror the official Base wrapper's text/prompt preparation,
                # then call its code generator to avoid a redundant full decode.
                input_ids = model._tokenize_texts([model._build_assistant_text(prepare_spoken_text(text, profile))])
                ref_ids = None if reference.x_vector_only else [model._tokenize_texts([model._build_ref_text(reference.text)])[0]]
                generation = model._merge_generate_kwargs(**GENERATION_OPTIONS)
                with guarded_talker(model, control, criteria_factory):
                    codes, _ = model.model.generate(
                        input_ids=input_ids, ref_ids=ref_ids,
                        voice_clone_prompt=model._prompt_items_to_voice_clone_prompt(prompt),
                        languages=["Portuguese"], non_streaming_mode=True, **generation,
                    )
                control.check()
                if len(codes) != 1 or int(codes[0].shape[0]) != collector.frames:
                    raise InvalidSpeech("Incomplete Qwen codec stream")
                collector.finish()
            finally:
                hook.remove()

    def synthesize_stream(text, profile="reading", pace="natural", control=None):
        text, profile, pace = validate_request(text, profile, pace)
        control = control or GenerationControl(time.monotonic() + GENERATION_SECONDS)
        yield from threaded_pcm_stream(lambda emit, current: generate(text, profile, pace, emit, current), control)

    def synthesize(text, profile="reading", pace="natural", control=None):
        # Prepared narration prioritizes the official complete waveform decoder.
        # The same immutable speaker prompt is reused; only live PCM requests
        # use short codec windows. Both represent the same voice/text cache key.
        text, profile, pace = validate_request(text, profile, pace)
        control = control or GenerationControl(time.monotonic() + GENERATION_SECONDS)
        control.check()
        with torch.inference_mode(), torch.random.fork_rng(devices=[0] if device == "cuda" else []):
            torch.manual_seed(DESIGN_SEED)
            if device == "cuda":
                torch.cuda.manual_seed_all(DESIGN_SEED)
            with guarded_talker(model, control, criteria_factory):
                wavs, rate = model.generate_voice_clone(
                    text=prepare_spoken_text(text, profile), language="Portuguese",
                    voice_clone_prompt=prompt, non_streaming_mode=True, **GENERATION_OPTIONS,
                )
        control.check()
        return pcm_wav(waveform_pcm(wavs, rate, np))

    synthesize.synthesize_stream = synthesize_stream
    synthesize.cache_identity = {
        "model": BASE_MODEL_ID, "revision": BASE_MODEL_REVISION,
        "voice_reference_sha256": reference.sha256,
        "transcript_sha256": hashlib.sha256(reference.text.encode("utf-8")).hexdigest() if reference.text else None,
        "reference_mode": "speaker_embedding" if reference.x_vector_only else "in_context",
        "delivery_version": FIXED_VERSION,
        "generation": generation_identity(device),
    }
    synthesize.voice_ready = True
    synthesize.fixed_voice = True
    synthesize.streaming = True
    return synthesize


def load_synthesizer(model_dir: Path, requested_device: str = "auto", reference_dir: Path | None = None) -> tuple[Callable, str]:
    # This service must never download models or send prompts to external hosts.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_DATASETS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    local_path = model_dir.resolve()
    if not local_path.is_dir() or not (local_path / "config.json").is_file():
        raise RuntimeError("Local voice model is missing")
    if requested_device not in ("auto", "cuda", "cpu"):
        raise ValueError("Unknown speech device")
    # Heavy imports remain here so HTTP and contract tests need no ML packages.
    import numpy as np
    import torch
    from qwen_tts import Qwen3TTSModel
    from transformers import StoppingCriteria, StoppingCriteriaList

    cuda_ready = torch.cuda.is_available()
    if requested_device == "cuda" and not cuda_ready:
        raise RuntimeError("CUDA is unavailable")
    device = "cuda" if cuda_ready and requested_device != "cpu" else "cpu"
    torch.set_num_threads(max(1, min(os.cpu_count() or 1, 4)))
    dtype = torch.bfloat16 if device == "cuda" else torch.float32
    model = Qwen3TTSModel.from_pretrained(
        str(local_path), device_map="cuda:0" if device == "cuda" else "cpu",
        dtype=dtype, attn_implementation="sdpa", local_files_only=True,
    )
    model_type = getattr(model.model, "tts_model_type", None)
    if model_type not in ("base", "voice_design"):
        raise RuntimeError("The installed model does not support Lumi speech")
    languages = model.get_supported_languages()
    if languages is not None and "portuguese" not in {str(language).lower() for language in languages}:
        raise RuntimeError("Portuguese voice generation is unavailable")
    model.model.eval()

    class RequestDeadline(StoppingCriteria):
        def __init__(self, control: GenerationControl):
            self.control = control

        def __call__(self, input_ids, _scores, **_kwargs):
            self.control.check()
            return torch.zeros(input_ids.shape[0], dtype=torch.bool, device=input_ids.device)

    def criteria_factory(control: GenerationControl):
        return StoppingCriteriaList([RequestDeadline(control)])

    if model_type == "base":
        reference = load_voice_reference(reference_dir or local_path.parent.parent / "voices/lumi")
        return build_fixed_synthesizer(model, reference, device, torch, np, criteria_factory), device

    def synthesize(text: str, profile: str = "reading", pace: str = "natural", control: GenerationControl | None = None) -> bytes:
        text, profile, pace = validate_request(text, profile, pace)
        control = control or GenerationControl(time.monotonic() + GENERATION_SECONDS)
        control.check()
        try:
            with torch.inference_mode(), torch.random.fork_rng(devices=[0] if device == "cuda" else []):
                torch.manual_seed(DESIGN_SEED)
                if device == "cuda":
                    torch.cuda.manual_seed_all(DESIGN_SEED)
                with guarded_talker(model, control, criteria_factory):
                    wavs, rate = model.generate_voice_design(
                        text=prepare_spoken_text(text, profile), language="Portuguese",
                        instruct=voice_instruction(profile, pace), non_streaming_mode=True,
                        **GENERATION_OPTIONS,
                    )
            control.check()
            if rate != SAMPLE_RATE or not isinstance(wavs, (list, tuple)) or len(wavs) != 1:
                raise InvalidSpeech("Unsupported audio output")
            samples = np.asarray(wavs[0])
            if samples.ndim != 1 or not 0 < len(samples) <= MAX_SECONDS * SAMPLE_RATE:
                raise InvalidSpeech("Audio duration limit exceeded")
            if not np.isfinite(samples).all() or float(np.max(np.abs(samples))) <= 0.0001:
                raise InvalidSpeech("Invalid audio samples")
            pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
            control.check()
            result = io.BytesIO()
            with wave.open(result, "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(SAMPLE_RATE)
                audio.writeframes(pcm)
            return checked_wav(result.getvalue())
        finally:
            if device == "cuda":
                torch.cuda.empty_cache()

    synthesize.cache_identity = {"model": MODEL_ID, "revision": MODEL_REVISION, "delivery_version": DESIGN_VERSION,
                                 "generation": generation_identity(device),
                                 "persona_sha256": hashlib.sha256(PERSONA.encode("utf-8")).hexdigest()}
    synthesize.voice_ready = True
    synthesize.fixed_voice = False
    synthesize.streaming = False
    return synthesize, device
