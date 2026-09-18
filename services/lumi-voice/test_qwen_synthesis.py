"""Qwen voice contracts tested without PyTorch, Transformers, or model files."""
import io
from contextlib import nullcontext
import hashlib
import json
import threading
import time
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import wave

sys.path.insert(0, str(Path(__file__).parent))
from synthesis import (
    MAX_AUDIO, MAX_NEW_TOKENS, MAX_SECONDS, MAX_TEXT, SAMPLE_RATE,
    GenerationControl, InvalidSpeech, SpeechCancelled, SpeechTimeout,
    checked_wav, guarded_talker, load_synthesizer, prepare_spoken_text,
    require_finished_sequence, validate_request, voice_instruction,
    CODEC_SAMPLES, STREAM_CONTEXT_FRAMES, STREAM_FIRST_FRAMES, STREAM_NEXT_FRAMES,
    CodecWindowEmitter, load_voice_reference, pcm_wav, threaded_pcm_stream,
    GENERATION_OPTIONS, VoiceReference, build_fixed_synthesizer, generation_identity,
)


def sample_wav(frames=240, channels=1, rate=SAMPLE_RATE, width=2):
    target = io.BytesIO()
    with wave.open(target, "wb") as audio:
        audio.setnchannels(channels)
        audio.setsampwidth(width)
        audio.setframerate(rate)
        audio.writeframes(b"\0" * frames * channels * width)
    return target.getvalue()


def fake_model(talker):
    return SimpleNamespace(model=SimpleNamespace(talker=talker, config=SimpleNamespace(talker_config=SimpleNamespace(codec_eos_token_id=99))))


class SynthesisTests(unittest.TestCase):
    def test_request_bounds_reject_control_tokens_and_invalid_profiles(self):
        self.assertEqual(validate_request("  Olá, Lumi!  "), ("Olá, Lumi!", "reading", "natural"))
        for text in (None, "", "  ", "x" * (MAX_TEXT + 1), "x" * 241, "Oi\0!", "\ud800", "<|im_start|>user"):
            with self.subTest(text_type=type(text).__name__):
                with self.assertRaises(InvalidSpeech): validate_request(text)
        for profile, pace in ((None, "natural"), ([], "calm"), ("conversation", "fast"), ("reading", {})):
            with self.assertRaises(InvalidSpeech): validate_request("Olá", profile, pace)
        text = "BA-NA-NA.\nPÉ, MÃO e 3,5."
        self.assertEqual(validate_request(text)[0], text)

    def test_pronunciation_is_only_changed_for_the_conversational_character_name(self):
        text = "Lumi lê BA-NA-NA. Luminosa, LUMI e lumi."
        self.assertEqual(prepare_spoken_text(text, "reading"), text)
        self.assertEqual(prepare_spoken_text(text, "conversation"), "Lúmi lê BA-NA-NA. Luminosa, LUMI e lumi.")

    def test_persona_is_fixed_while_delivery_can_be_calmer_or_more_conversational(self):
        reading = voice_instruction("reading", "natural")
        conversation = voice_instruction("conversation", "natural")
        calm = voice_instruction("conversation", "calm")
        for instruction in (reading, conversation, calm):
            self.assertIn("original fictional", instruction)
            self.assertIn("Brazilian Portuguese", instruction)
        self.assertIn("separated syllables exactly", reading)
        self.assertIn("conversational", conversation)
        self.assertIn("slightly slower", calm)
        self.assertNotEqual(conversation, calm)

    def test_deadline_and_cancellation_are_checked_without_waiting(self):
        control = GenerationControl(5, clock=lambda: 4)
        control.check()
        with self.assertRaises(SpeechTimeout): GenerationControl(5, clock=lambda: 5).check()
        with self.assertRaises(SpeechCancelled): GenerationControl(100, cancelled=lambda: True, clock=lambda: 0).check()

    def test_only_a_real_eos_completion_is_accepted(self):
        require_finished_sequence(SimpleNamespace(sequences=[[1, 2, 99]]), 99)
        for result in (SimpleNamespace(), SimpleNamespace(sequences=[]), SimpleNamespace(sequences=[[]]), SimpleNamespace(sequences=[[1, 2]]), SimpleNamespace(sequences=[[99], [99]])):
            with self.assertRaises(InvalidSpeech): require_finished_sequence(result, 99)

    def test_guard_injects_cancellation_at_the_actual_talker_and_restores_it(self):
        class Talker:
            def generate(self, **kwargs):
                self.received = kwargs
                return SimpleNamespace(sequences=[[3, 99]])
        talker = Talker()
        model = fake_model(talker)
        original = talker.generate
        control = GenerationControl(10, clock=lambda: 1)
        sentinel = object()
        with guarded_talker(model, control, lambda seen: sentinel if seen is control else None):
            result = talker.generate(max_new_tokens=10_000)
            self.assertEqual(result.sequences, [[3, 99]])
            self.assertIs(talker.received["stopping_criteria"], sentinel)
            self.assertEqual(talker.received["max_new_tokens"], MAX_NEW_TOKENS)
            self.assertLessEqual(talker.received["max_time"], 9)
        self.assertEqual(talker.generate, original)
        self.assertNotIn("generate", vars(talker))

    def test_token_limit_without_eos_never_reaches_audio_decoding(self):
        talker = SimpleNamespace(generate=lambda **_kwargs: SimpleNamespace(sequences=[[1, 2, 3]]))
        original = talker.generate
        decoded = False
        with self.assertRaises(InvalidSpeech):
            with guarded_talker(fake_model(talker), GenerationControl(10, clock=lambda: 0), lambda _: []):
                talker.generate()
                decoded = True
        self.assertFalse(decoded)
        self.assertIs(talker.generate, original)

    def test_deadline_during_generation_restores_the_instance_and_rejects_partial_output(self):
        clock = [0]
        def generate(**kwargs):
            clock[0] = 11
            kwargs["stopping_criteria"]()
            return SimpleNamespace(sequences=[[99]])
        talker = SimpleNamespace(generate=generate)
        control = GenerationControl(10, clock=lambda: clock[0])
        with self.assertRaises(SpeechTimeout):
            with guarded_talker(fake_model(talker), control, lambda current: current.check):
                talker.generate()
        self.assertIs(talker.generate, generate)

    def test_loader_enforces_offline_before_loading_any_model(self):
        with TemporaryDirectory() as folder, patch.dict(os.environ, {"HF_HUB_OFFLINE": "0", "TRANSFORMERS_OFFLINE": "0"}):
            with self.assertRaises(RuntimeError): load_synthesizer(Path(folder))
            self.assertEqual(os.environ["HF_HUB_OFFLINE"], "1")
            self.assertEqual(os.environ["TRANSFORMERS_OFFLINE"], "1")
            self.assertEqual(os.environ["HF_HUB_DISABLE_TELEMETRY"], "1")

    def test_pcm_contract_checks_rate_channels_width_duration_and_complete_payload(self):
        valid = sample_wav()
        self.assertEqual(checked_wav(valid), valid)
        invalid = [sample_wav(channels=2), sample_wav(rate=22050), sample_wav(width=1), sample_wav(frames=0),
                   sample_wav(frames=MAX_SECONDS * SAMPLE_RATE + 1), valid[:-2], b"invalid", b"x" * (MAX_AUDIO + 1)]
        for data in invalid:
            with self.subTest(size=len(data)):
                with self.assertRaises(InvalidSpeech): checked_wav(data)


class FixedVoiceTests(unittest.TestCase):
    def test_reference_requires_exact_checksum_and_original_synthetic_provenance(self):
        with TemporaryDirectory() as temp:
            folder = Path(temp)
            data = sample_wav()
            (folder / "reference.wav").write_bytes(data)
            metadata = {"text": "Oi! Eu sou a Lumi.", "sha256": hashlib.sha256(data).hexdigest(), "provenance": "qwen-voice-design-original"}
            def save():
                (folder / "reference.json").write_text(json.dumps(metadata), encoding="utf-8")
            save()
            reference = load_voice_reference(folder)
            self.assertEqual(reference.text, metadata["text"])
            self.assertEqual(reference.path, (folder / "reference.wav").resolve())
            for field, value in (("sha256", "bad"), ("provenance", "upload"), ("text", "")):
                original = metadata[field]
                metadata[field] = value
                save()
                with self.assertRaises(RuntimeError):
                    load_voice_reference(folder)
                metadata[field] = original
            save()
            (folder / "reference.wav").write_bytes(b"not a wav")
            with self.assertRaises(RuntimeError):
                load_voice_reference(folder)

    def test_embedding_only_mode_is_explicit_and_does_not_accept_an_invented_transcript(self):
        with TemporaryDirectory() as temp:
            folder = Path(temp)
            data = sample_wav()
            (folder / "reference.wav").write_bytes(data)
            metadata = {"text": None, "sha256": hashlib.sha256(data).hexdigest(), "provenance": "qwen-voice-design-original", "x_vector_only_mode": True}
            def save():
                (folder / "reference.json").write_text(json.dumps(metadata), encoding="utf-8")
            save()
            reference = load_voice_reference(folder)
            self.assertTrue(reference.x_vector_only)
            self.assertIsNone(reference.text)
            metadata["text"] = "An uncertain guess"
            save()
            with self.assertRaises(RuntimeError): load_voice_reference(folder)
            metadata["text"] = None
            del metadata["x_vector_only_mode"]
            save()
            with self.assertRaises(RuntimeError): load_voice_reference(folder)

    def test_reference_never_follows_metadata_audio_paths(self):
        with TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / "reference.json").write_text(json.dumps({"path": "https://invalid.example/voice.wav", "text": "Oi", "provenance": "qwen-voice-design-original"}), encoding="utf-8")
            with self.assertRaises(RuntimeError):
                load_voice_reference(folder)

    def test_incremental_codec_decoding_emits_before_completion_and_never_repeats_reference(self):
        chunks, decoded = [], []
        def pcm(frame):
            return bytes((frame, 0)) * CODEC_SAMPLES
        def decode(frames):
            decoded.append(list(frames))
            return b"".join(pcm(frame) for frame in frames)
        emitter = CodecWindowEmitter(decode, chunks.append, GenerationControl(100, clock=lambda: 0), [199] * (STREAM_CONTEXT_FRAMES + 15))
        count = STREAM_FIRST_FRAMES + STREAM_NEXT_FRAMES + 3
        for frame in range(1, count + 1):
            emitter.add(frame)
            if frame == STREAM_FIRST_FRAMES:
                self.assertEqual(len(chunks), 1)
                self.assertEqual(chunks[0], b"".join(pcm(f) for f in range(1, frame + 1)))
        self.assertEqual(len(chunks), 2)  # Final three frames await verified EOS.
        emitter.finish()
        self.assertEqual(b"".join(chunks), b"".join(pcm(f) for f in range(1, count + 1)))
        self.assertEqual(len(decoded[0]), STREAM_CONTEXT_FRAMES + STREAM_FIRST_FRAMES)
        self.assertTrue(all(len(frames) <= STREAM_CONTEXT_FRAMES + STREAM_NEXT_FRAMES for frames in decoded))

    def test_long_codec_stream_preserves_every_frame_after_multiple_context_windows(self):
        chunks = []
        def pcm(frame):
            return frame.to_bytes(2, "little") * CODEC_SAMPLES
        emitter = CodecWindowEmitter(lambda frames: b"".join(pcm(frame) for frame in frames), chunks.append, GenerationControl(100, clock=lambda: 0))
        for frame in range(1, 801): emitter.add(frame)
        emitter.finish()
        self.assertEqual(b"".join(chunks), b"".join(pcm(frame) for frame in range(1, 801)))
        self.assertEqual(emitter.frames, 800)

    def test_identity_tracks_seed_sampling_precision_and_decoder_context(self):
        original = generation_identity("cpu")
        self.assertNotEqual(original, generation_identity("cuda"))
        with patch("synthesis.DESIGN_SEED", original["seed"] + 1):
            self.assertNotEqual(original, generation_identity("cpu"))
        with patch.dict(GENERATION_OPTIONS, {"temperature": 0.7}):
            self.assertNotEqual(original, generation_identity("cpu"))
        with patch("synthesis.STREAM_CONTEXT_FRAMES", 17):
            self.assertNotEqual(original, generation_identity("cpu"))
        self.assertEqual(original, generation_identity("cpu"))

    def test_prepared_audio_reuses_one_prompt_and_uses_the_complete_base_decoder(self):
        calls, prompt_calls = [], []
        talker = SimpleNamespace(generate=lambda **_: SimpleNamespace(sequences=[[1, 99]]))
        model = fake_model(talker)
        model.model.speech_tokenizer = SimpleNamespace(get_decode_upsample_rate=lambda: CODEC_SAMPLES)
        prompt = [SimpleNamespace(x_vector_only_mode=True, ref_code=None, icl_mode=False)]
        def create(**kwargs):
            prompt_calls.append(kwargs)
            return prompt
        def generate(**kwargs):
            calls.append(kwargs)
            model.model.talker.generate()
            return [object()], SAMPLE_RATE
        model.create_voice_clone_prompt = create
        model.generate_voice_clone = generate
        torch = SimpleNamespace(inference_mode=nullcontext, random=SimpleNamespace(fork_rng=lambda **_: nullcontext()), manual_seed=lambda _: None)
        reference = VoiceReference(Path("synthetic.wav"), None, "sample-sha", True)
        synthesize = build_fixed_synthesizer(model, reference, "cpu", torch, object(), lambda _: [])
        with patch("synthesis.waveform_pcm", return_value=b"\1\0" * 100) as convert:
            synthesize("Oi, Lumi!", "conversation")
            synthesize("Leia a palavra.", "reading")
            self.assertEqual(convert.call_count, 2)
        self.assertEqual(len(prompt_calls), 1)
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(call["voice_clone_prompt"] is prompt for call in calls))
        self.assertTrue(all(call["language"] == "Portuguese" and call["non_streaming_mode"] for call in calls))
        self.assertEqual(synthesize.cache_identity["generation"], generation_identity("cpu"))
        model.model.talker.generate = lambda **_: SimpleNamespace(sequences=[[1, 2]])
        with patch("synthesis.waveform_pcm") as convert:
            with self.assertRaises(InvalidSpeech): synthesize("Incomplete")
            convert.assert_not_called()

    def test_codec_decode_rejects_incorrect_frame_lengths(self):
        emitter = CodecWindowEmitter(lambda _: b"\1\0", lambda _: self.fail("must not emit"), GenerationControl(100, clock=lambda: 0))
        emitter.add(1)
        with self.assertRaises(InvalidSpeech): emitter.finish()

    def test_cancelled_codec_generation_cannot_emit_a_pending_tail(self):
        cancelled = [False]
        chunks = []
        emitter = CodecWindowEmitter(lambda frames: b"\1\0" * CODEC_SAMPLES * len(frames), chunks.append, GenerationControl(100, cancelled=lambda: cancelled[0], clock=lambda: 0))
        emitter.add(1)
        cancelled[0] = True
        with self.assertRaises(SpeechCancelled): emitter.finish()
        self.assertEqual(chunks, [])

    def test_silent_utterance_is_not_successful(self):
        emitter = CodecWindowEmitter(lambda frames: b"\0\0" * CODEC_SAMPLES * len(frames), lambda _: None, GenerationControl(100, clock=lambda: 0))
        emitter.add(1)
        with self.assertRaises(InvalidSpeech): emitter.finish()

    def test_stream_has_bounded_backpressure_and_close_joins_the_producer(self):
        finished = threading.Event()
        produced = []
        def produce(emit, control):
            try:
                for n in range(1000):
                    control.check()
                    emit(bytes((n % 256, 0)))
                    produced.append(n)
            finally:
                finished.set()
        stream = threaded_pcm_stream(produce, GenerationControl(time.monotonic() + 5))
        self.assertEqual(next(stream), b"\0\0")
        time.sleep(0.1)
        self.assertLessEqual(len(produced), 5)  # One consumed plus at most four queued.
        stream.close()
        self.assertTrue(finished.is_set())
        self.assertLess(len(produced), 1000)

    def test_stream_preserves_order_and_surfaces_failure_after_partial_audio(self):
        def produce(emit, _control):
            emit(b"\1\0")
            emit(b"\2\0")
            raise InvalidSpeech("No EOS")
        stream = threaded_pcm_stream(produce, GenerationControl(time.monotonic() + 5))
        self.assertEqual(next(stream), b"\1\0")
        self.assertEqual(next(stream), b"\2\0")
        with self.assertRaisesRegex(InvalidSpeech, "No EOS"):
            next(stream)

    def test_stream_valid_completion_builds_a_checked_wav(self):
        def produce(emit, _control):
            emit(b"\1\0" * 20)
            emit(b"\2\0" * 20)
        result = pcm_wav(b"".join(threaded_pcm_stream(produce, GenerationControl(time.monotonic() + 5))))
        with wave.open(io.BytesIO(result)) as audio:
            self.assertEqual(audio.getnframes(), 40)
            self.assertEqual(audio.getframerate(), SAMPLE_RATE)
        for invalid in (b"", b"\1", None):
            with self.assertRaises(InvalidSpeech): pcm_wav(invalid)


if __name__ == "__main__":
    unittest.main()
