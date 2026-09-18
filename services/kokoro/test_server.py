"""HTTP contracts tested without downloading models or installing packages."""
import http.client
import io
import json
from pathlib import Path
import sys
import threading
import unittest
import wave

sys.path.insert(0, str(Path(__file__).parent))
from server import MAX_BODY, MAX_CACHE_ITEMS, MAX_TEXT, SAMPLE_RATE, SpeechServer, speech_chunks


def sample_wav():
    result = io.BytesIO()
    with wave.open(result, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)
        audio.writeframes(b"\0\0" * 240)
    return result.getvalue()


class SpeechTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.token = "test-only-token-" + "x" * 32
        cls.audio = sample_wav()
        cls.server = SpeechServer(("127.0.0.1", 0), cls.token, lambda text, profile, pace: cls.audio)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        with self.server.cache_lock:
            self.server.cache.clear()
            self.server.cache_bytes = 0
        self.calls = []
        self.profiles = []
        def fake(text, profile, pace):
            self.calls.append(text)
            self.profiles.append((profile, pace))
            return self.audio
        self.server.synthesize = fake

    def request(self, path="/v1/audio/speech", body=None, headers=None, method="POST", raw=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        outgoing = {
            "Authorization": "Bearer " + self.token,
            "Content-Type": "application/json",
        }
        outgoing.update(headers or {})
        if outgoing.get("Authorization") is None:
            del outgoing["Authorization"]
        payload = raw if raw is not None else json.dumps(body if body is not None else {"input": "Olá, sou a Lumi!"})
        connection.request(method, path, body=payload, headers=outgoing)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_health_requires_token_and_reports_fixed_voice(self):
        self.assertEqual(self.request("/health", method="GET", headers={"Authorization": None})[0], 401)
        self.assertEqual(self.request("/health", method="GET", headers={"Authorization": "Bearer wrong"})[0], 401)
        status, _, body = self.request("/health", method="GET")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"status": "ready", "model": "kokoro", "voice": "pf_dora"})

    def test_rejects_browser_origins_and_foreign_hosts(self):
        for headers in ({"Origin": "http://localhost:3002"}, {"Origin": "null"}, {"Host": "attacker.example"}):
            with self.subTest(headers=headers):
                self.assertEqual(self.request(headers=headers)[0], 403)
        self.assertEqual(self.calls, [])

    def test_requires_json_and_a_known_route(self):
        self.assertEqual(self.request(headers={"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.request(path="/missing")[0], 404)
        self.assertEqual(self.request(raw="{oops")[0], 400)
        self.assertEqual(self.request(body=[])[0], 400)

    def test_validates_text_voice_and_body_bounds(self):
        for body in ({"input": ""}, {"input": "  "}, {"input": 1}, {"input": "a" * (MAX_TEXT + 1)},
                     {"input": "Olá", "voice": "af_heart"}, {"input": "Olá", "response_format": "mp3"},
                     {"input": "x" * 241}, {"input": "\ud800"}):
            with self.subTest(body=body):
                self.assertEqual(self.request(body=body)[0], 400)
        self.assertEqual(self.request(raw="x" * (MAX_BODY + 1))[0], 413)
        self.assertEqual(self.request(headers={"Content-Length": "-1"})[0], 413)
        self.assertEqual(self.request(headers={"Transfer-Encoding": "chunked"})[0], 411)
        self.assertEqual(self.calls, [])

    def test_returns_wav_and_uses_bounded_memory_cache(self):
        for _ in range(2):
            status, headers, data = self.request()
            self.assertEqual(status, 200)
            self.assertEqual(headers["Content-Type"], "audio/wav")
            self.assertEqual(headers["Cache-Control"], "no-store, private")
            self.assertEqual(data, self.audio)
        self.assertEqual(self.calls, ["Olá, sou a Lumi!"])
        for index in range(MAX_CACHE_ITEMS + 2):
            self.request(body={"input": f"Território {index}."})
        self.assertEqual(len(self.server.cache), MAX_CACHE_ITEMS)
        self.assertEqual(self.server.cache_bytes, MAX_CACHE_ITEMS * len(self.audio))
        self.assertTrue(all(len(key) == 64 for key in self.server.cache))

    def test_profiles_and_paces_have_separate_cache_entries(self):
        text = "Olá, vamos descobrir uma pista juntos?"
        bodies = [
            {"input": text},
            {"input": text, "profile": "conversation"},
            {"input": text, "profile": "conversation", "pace": "calm"},
        ]
        for body in bodies + bodies:
            self.assertEqual(self.request(body=body)[0], 200)
        self.assertEqual(self.calls, [text, text, text])
        self.assertEqual(self.profiles, [("reading", "natural"), ("conversation", "natural"), ("conversation", "calm")])
        self.assertEqual(len(self.server.cache), 3)

    def test_unknown_profiles_and_paces_are_rejected_before_synthesis(self):
        for extra in ({"profile": "robot"}, {"pace": "fast"}, {"profile": None}, {"pace": []}, {"profile": 1}):
            with self.subTest(extra=extra):
                self.assertEqual(self.request(body={"input": "Olá", **extra})[0], 400)
        self.assertEqual(self.calls, [])

    def test_busy_synthesis_is_rejected_without_queueing(self):
        self.server.synthesis_lock.acquire()
        try:
            self.assertEqual(self.request()[0], 503)
            self.assertEqual(self.calls, [])
        finally:
            self.server.synthesis_lock.release()
        self.assertEqual(self.request()[0], 200)

    def test_failure_is_private_and_releases_synthesis_lock(self):
        def broken(text, profile, pace):
            raise RuntimeError("secret token and user text " + text)
        self.server.synthesize = broken
        status, _, body = self.request()
        self.assertEqual(status, 503)
        self.assertNotIn(b"secret", body)
        self.assertNotIn(b"Lumi", body)
        self.assertFalse(self.server.synthesis_lock.locked())
        self.assertEqual(len(self.server.cache), 0)

    def test_invalid_generated_audio_is_never_returned_or_cached(self):
        self.server.synthesize = lambda text, profile, pace: b"not a wave"
        self.assertEqual(self.request()[0], 422)
        self.assertEqual(len(self.server.cache), 0)

    def test_service_cannot_bind_publicly_or_start_without_secret(self):
        with self.assertRaises(ValueError):
            SpeechServer(("0.0.0.0", 0), self.token, lambda text, profile, pace: self.audio)
        with self.assertRaises(ValueError):
            SpeechServer(("127.0.0.1", 0), "", lambda text, profile, pace: self.audio)

    def test_sentence_boundaries_preserve_words_and_syllables(self):
        text = "Olá! Vamos ler BA-NA-NA. " + "aprendizado " * 40 + "Fim."
        chunks = speech_chunks(text)
        self.assertEqual(chunks[:2], ["Olá!", "Vamos ler BA-NA-NA."])
        self.assertTrue(all(len(chunk) <= 240 for chunk in chunks))
        self.assertEqual(" ".join(chunks), " ".join(text.split()))


if __name__ == "__main__":
    unittest.main()
