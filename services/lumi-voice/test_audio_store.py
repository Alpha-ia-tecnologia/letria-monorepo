"""Persistent prepared audio contracts; no GPU or voice packages required."""
from concurrent.futures import ThreadPoolExecutor
import http.client
import io
import json
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import wave

sys.path.insert(0, str(Path(__file__).parent))
from audio_store import AudioStore, audio_key
import preparation
from server import SpeechServer
from synthesis import SAMPLE_RATE


def sample_wav(value=1):
    target = io.BytesIO()
    with wave.open(target, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)
        audio.writeframes(bytes([value, 0]) * 240)
    return target.getvalue()


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.audio = sample_wav()
        self.key = audio_key({"model": "base", "reference": "abc"}, "Texto privado", "reading", "natural")

    def tearDown(self):
        self.temporary.cleanup()

    def test_completed_wav_survives_restart_without_transcripts_or_plaintext_filenames(self):
        store = AudioStore(self.directory)
        store.put(self.key, self.audio)
        self.assertEqual(AudioStore(self.directory).get(self.key), self.audio)
        files = list(self.directory.iterdir())
        self.assertEqual([path.name for path in files], [self.key + ".wav"])
        self.assertNotIn(b"Texto privado", files[0].read_bytes())

    def test_key_changes_with_model_reference_text_profile_and_pace(self):
        original = ({"model": "base", "reference": "abc"}, "Texto privado", "reading", "natural")
        variants = [({"model": "base-v2", "reference": "abc"}, *original[1:]),
                    ({"model": "base", "reference": "def"}, *original[1:]),
                    (original[0], "Outro texto", *original[2:]),
                    (*original[:2], "conversation", original[3]), (*original[:3], "calm")]
        self.assertTrue(all(audio_key(*variant) != self.key for variant in variants))
        self.assertEqual(audio_key({"reference": "abc", "model": "base"}, *original[1:]), self.key)

    def test_atomic_replacement_never_accepts_partial_wav(self):
        store = AudioStore(self.directory)
        store.put(self.key, self.audio)
        with self.assertRaises(ValueError):
            store.put(self.key, b"partial")
        self.assertEqual(store.get(self.key), self.audio)
        with patch("audio_store.os.replace", side_effect=OSError("Test write failed")):
            with self.assertRaises(OSError):
                store.put(self.key, sample_wav(2))
        self.assertEqual(store.get(self.key), self.audio)
        self.assertEqual(len(list(self.directory.iterdir())), 1)

    def test_corrupt_oversized_or_partial_files_are_removed_and_paths_cannot_escape(self):
        store = AudioStore(self.directory)
        path = self.directory / (self.key + ".wav")
        for data in (b"partial", b"x" * (5 * 1024 * 1024 + 1)):
            path.write_bytes(data)
            self.assertIsNone(store.get(self.key))
            self.assertFalse(path.exists())
        for key in ("../outside", "X" * 64, "a" * 63, "a" * 65):
            with self.assertRaises(ValueError):
                store.put(key, self.audio)
            with self.assertRaises(ValueError):
                store.get(key)

    def test_limits_evict_older_audio_and_prune_existing_files_on_restart(self):
        store = AudioStore(self.directory, max_items=2)
        for index in range(3):
            store.put(f"{index:064x}", self.audio)
            time.sleep(0.002)
        self.assertEqual(len(list(self.directory.glob("*.wav"))), 2)
        self.assertIsNone(store.get("0" * 64))
        smaller = AudioStore(self.directory, max_bytes=len(self.audio), max_items=10)
        self.assertEqual(len(list(self.directory.glob("*.wav"))), 1)
        self.assertEqual(smaller.get(f"{2:064x}"), self.audio)


class PreparationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        self.token = "test-preparation-only-" + "x" * 40
        self.audio = sample_wav()
        self.calls = []
        def fake(text, profile, pace, control):
            control.check()
            self.calls.append((text, profile, pace))
            return self.audio
        self.server = SpeechServer(("127.0.0.1", 0), self.token, fake, "cpu", self.directory)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.temporary.cleanup()

    def request(self, path="/v1/audio/prepare", body=None, headers=None, method="POST"):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        outgoing = {"Authorization": "Bearer " + self.token, "Content-Type": "application/json"}
        outgoing.update(headers or {})
        connection.request(method, path, json.dumps(body), outgoing)
        response = connection.getresponse()
        result = response.status, response.read()
        connection.close()
        return result

    def wait_for(self, predicate):
        deadline = time.monotonic() + 2
        while not predicate() and time.monotonic() < deadline:
            time.sleep(0.005)
        self.assertTrue(predicate())

    def test_preparation_and_status_require_authentication_and_reject_origins(self):
        for headers, expected in [({"Authorization": "Bearer wrong"}, 401), ({"Origin": "null"}, 403)]:
            self.assertEqual(self.request(body={"items": [{"input": "Oi!"}]}, headers=headers)[0], expected)
            self.assertEqual(self.request("/v1/audio/prepare/" + "a" * 32, headers=headers, method="GET")[0], expected)
        self.assertFalse(self.calls)
        self.assertFalse(list(self.directory.iterdir()))

    def test_prepare_persists_only_explicit_items_then_serves_them_without_synthesis(self):
        status, body = self.request(body={"items": [{"input": "Vamos explorar!", "profile": "conversation"}]})
        self.assertEqual(status, 202)
        job = json.loads(body)
        self.wait_for(lambda: self.server.preparation.status(job["job_id"])["remaining"] == 0)
        status, body = self.request("/v1/audio/prepare/" + job["job_id"], method="GET")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["status"], "ready")
        self.assertNotIn(b"Vamos", body)
        self.assertEqual(len(list(self.directory.glob("*.wav"))), 1)
        with self.server.cache_lock:
            self.server.cache.clear()
            self.server.cache_bytes = 0
        self.assertEqual(self.request("/v1/audio/speech", {"input": "Vamos explorar!", "profile": "conversation"})[0], 200)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.request("/v1/audio/speech", {"input": "Pergunta privada de um aluno"})[0], 200)
        self.assertEqual(len(list(self.directory.glob("*.wav"))), 1)
        self.assertEqual(len(self.calls), 2)

    def test_invalid_batches_are_rejected_all_or_nothing(self):
        for body in ({}, {"items": []}, {"items": "text"}, {"items": [{"input": "oi"}] * 33},
                     {"items": [{"input": "oi"}, {"input": ""}]}, {"items": [{"input": "oi", "voice": "other"}]},
                     {"items": [{"input": "oi"}], "persist": True}):
            self.assertEqual(self.request(body=body)[0], 400)
        self.assertFalse(self.calls)
        self.assertFalse(list(self.directory.iterdir()))

    def test_queue_is_bounded_and_duplicate_items_are_deduplicated(self):
        self.server.synthesis_lock.acquire()
        try:
            with patch.object(preparation, "MAX_PENDING_ITEMS", 2):
                status, body = self.request(body={"items": [{"input": "um"}, {"input": "um"}, {"input": "dois"}]})
                self.assertEqual(status, 202)
                self.assertEqual(json.loads(body)["total"], 2)
                self.assertEqual(self.request(body={"items": [{"input": "tres"}]})[0], 503)
        finally:
            self.server.release_turn()
        self.wait_for(lambda: self.server.preparation.pending_count() == 0)

    def test_interactive_speech_preempts_preparation_and_it_resumes_afterwards(self):
        background_started = threading.Event()
        sequence = []
        def fake(text, _profile, _pace, control):
            sequence.append(text)
            if text == "catalogue" and sequence.count(text) == 1:
                background_started.set()
                deadline = time.monotonic() + 2
                while time.monotonic() < deadline:
                    control.check()
                    time.sleep(0.005)
                raise RuntimeError("Interactive request did not preempt background work")
            control.check()
            return self.audio
        self.server.synthesize = fake
        status, body = self.request(body={"items": [{"input": "catalogue"}]})
        job = json.loads(body)
        self.assertEqual(status, 202)
        self.assertTrue(background_started.wait(1))
        self.assertEqual(self.request("/v1/audio/speech", {"input": "student"})[0], 200)
        self.wait_for(lambda: self.server.preparation.status(job["job_id"])["remaining"] == 0)
        self.assertEqual(sequence, ["catalogue", "student", "catalogue"])
        self.assertEqual(self.server.preparation.status(job["job_id"])["status"], "ready")
        self.assertEqual(len(list(self.directory.glob("*.wav"))), 1)

    def test_pending_preparation_is_restored_after_restart_and_finishes(self):
        started = threading.Event()
        def blocked(_text, _profile, _pace, control):
            started.set()
            while True:
                control.check()
                time.sleep(0.005)
        self.server.synthesize = blocked
        status, body = self.request(body={"items": [{"input": "Saved catalogue one"}, {"input": "Saved catalogue two"}]})
        self.assertEqual(status, 202)
        job_id = json.loads(body)["job_id"]
        self.assertTrue(started.wait(1))
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        saved = json.loads((self.directory / "preparation.json").read_text(encoding="utf-8"))
        self.assertEqual(len(saved["items"]), 2)
        calls = []
        def resumed(text, _profile, _pace, control):
            control.check()
            calls.append(text)
            return self.audio
        self.server = SpeechServer(("127.0.0.1", 0), self.token, resumed, "cpu", self.directory)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()
        self.wait_for(lambda: self.server.preparation.status(job_id)["remaining"] == 0)
        self.assertEqual(calls, ["Saved catalogue one", "Saved catalogue two"])
        self.assertEqual(self.server.preparation.status(job_id)["status"], "ready")
        self.assertEqual(len(list(self.directory.glob("*.wav"))), 2)
        saved = json.loads((self.directory / "preparation.json").read_text(encoding="utf-8"))
        self.assertEqual(saved["items"], [])
        self.assertNotIn("Saved catalogue", json.dumps(saved))

    def test_changed_voice_invalidates_ready_jobs_and_preserves_only_pending_work(self):
        # Simulate a valid previous journal: one completed job and one partially
        # prepared job with just its remaining text. No completed text is kept.
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        done_id, partial_id = "a" * 32, "b" * 32
        journal = {"version": 1, "voice_identity": "old-voice-identity", "jobs": [
            {"job_id": done_id, "status": "ready", "total": 1, "completed": 1, "failed": 0, "remaining": 0},
            {"job_id": partial_id, "status": "running", "total": 2, "completed": 1, "failed": 0, "remaining": 1},
        ], "items": [[partial_id, "Remaining catalogue text", "reading", "natural"]]}
        (self.directory / "preparation.json").write_text(json.dumps(journal), encoding="utf-8")
        calls = []
        def resumed(text, _profile, _pace, control):
            control.check()
            calls.append(text)
            return self.audio
        resumed.cache_identity = {"model": "new-base", "reference": "new-lumi-reference"}
        self.server = SpeechServer(("127.0.0.1", 0), self.token, resumed, "cpu", self.directory)
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.thread.start()
        self.wait_for(lambda: self.server.preparation.status(partial_id)["remaining"] == 0)
        self.assertIsNone(self.server.preparation.status(done_id))
        self.assertEqual(self.request("/v1/audio/prepare/" + done_id, method="GET")[0], 404)
        result = self.server.preparation.status(partial_id)
        self.assertEqual((result["status"], result["completed"], result["failed"]), ("partial", 1, 1))
        self.assertEqual(calls, ["Remaining catalogue text"])
        saved = json.loads((self.directory / "preparation.json").read_text(encoding="utf-8"))
        self.assertEqual(saved["voice_identity"], self.server.audio_key("", "reading", "natural"))
        self.assertEqual(saved["items"], [])

    def test_live_conversation_never_enters_preparation_journal(self):
        status, body = self.request(body={"items": [{"input": "Public catalogue instruction"}]})
        self.assertEqual(status, 202)
        job_id = json.loads(body)["job_id"]
        self.wait_for(lambda: self.server.preparation.status(job_id)["remaining"] == 0)
        self.assertEqual(self.request("/v1/audio/speech", {"input": "Private child conversation"})[0], 200)
        journal = (self.directory / "preparation.json").read_text(encoding="utf-8")
        self.assertNotIn("Private child conversation", journal)

    def test_submission_does_not_claim_acceptance_when_journal_cannot_be_saved(self):
        with patch("preparation.os.replace", side_effect=OSError("Private local detail")):
            status, body = self.request(body={"items": [{"input": "Unpersisted instruction"}]})
        self.assertEqual(status, 503)
        self.assertEqual(json.loads(body)["code"], "PREPARATION_UNAVAILABLE")
        self.assertNotIn(b"Private", body)
        self.assertEqual(self.server.preparation.pending_count(), 0)
        self.assertFalse(self.calls)
        self.assertFalse(list(self.directory.iterdir()))

    def test_failed_preparation_reports_failure_without_storing_partial_audio(self):
        self.server.synthesize = lambda *_: b"partial"
        status, body = self.request(body={"items": [{"input": "catalogue"}]})
        job = json.loads(body)
        self.assertEqual(status, 202)
        self.wait_for(lambda: self.server.preparation.status(job["job_id"])["remaining"] == 0)
        result = self.server.preparation.status(job["job_id"])
        self.assertEqual((result["status"], result["completed"], result["failed"]), ("failed", 0, 1))
        self.assertFalse(list(self.directory.glob("*.wav")))


if __name__ == "__main__":
    unittest.main()
