"""Local Qwen HTTP contracts using an in-memory synthesizer, without ML packages."""
from concurrent.futures import ThreadPoolExecutor
import base64
import http.client
import importlib.util
import io
import json
from pathlib import Path
import socket
import sys
import threading
import time
import unittest
from unittest.mock import patch
import wave

sys.path.insert(0, str(Path(__file__).parent))
_spec = importlib.util.spec_from_file_location("letria_qwen_server", Path(__file__).with_name("server.py"))
server_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(server_module)
SpeechServer = server_module.SpeechServer
from synthesis import InvalidSpeech, SAMPLE_RATE, SpeechTimeout


def sample_wav():
    target = io.BytesIO()
    with wave.open(target, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)
        audio.writeframes(b"\0\0" * 240)
    return target.getvalue()


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.token = "test-qwen-only-" + "x" * 40
        cls.audio = sample_wav()
        cls.server = SpeechServer(("127.0.0.1", 0), cls.token, lambda *_: cls.audio, "cpu")
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def setUp(self):
        self.server.clock = time.monotonic
        self.wait_for(lambda: not self.server.request_events and not self.server.pending)
        with self.server.queue_condition:
            self.server.cancelled_ids.clear()
            self.assertFalse(self.server.pending)
            self.assertFalse(self.server.request_events)
        with self.server.cache_lock:
            self.server.cache.clear()
            self.server.cache_bytes = 0
        self.calls = []
        def fake(text, profile, pace, control):
            control.check()
            self.calls.append((text, profile, pace))
            return self.audio
        self.server.synthesize = fake

    def request(self, path="/v1/audio/speech", body=None, headers=None, method="POST", raw=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        outgoing = {"Authorization": "Bearer " + self.token, "Content-Type": "application/json"}
        outgoing.update(headers or {})
        if outgoing.get("Authorization") is None:
            del outgoing["Authorization"]
        payload = raw if raw is not None else json.dumps(body if body is not None else {"input": "Olá, sou a Lumi!"})
        connection.request(method, path, payload, outgoing)
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_health_requires_auth_and_exposes_only_ready_model_voice_and_device(self):
        self.assertEqual(self.request("/health", method="GET", headers={"Authorization": None})[0], 401)
        self.assertEqual(self.request("/health", method="GET", headers={"Authorization": "Bearer invalid"})[0], 401)
        status, _, body = self.request("/health", method="GET")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {"status": "ready", "model": "qwen3-tts", "voice": "lumi", "device": "cpu",
                                             "fixed_voice": False, "streaming": False,
                                             "preparation": {"enabled": False, "pending": 0}})
        self.assertNotIn(self.token.encode(), body)

    def test_browser_origins_and_foreign_hosts_are_rejected(self):
        for headers in ({"Origin": "null"}, {"Origin": "http://localhost:3002"}, {"Host": "attacker.example"}):
            self.assertEqual(self.request(headers=headers)[0], 403)
        self.assertEqual(self.request(method="OPTIONS")[0], 403)
        self.assertEqual(self.calls, [])

    def test_routes_json_body_limits_and_transfer_encoding_are_checked(self):
        self.assertEqual(self.request(path="/unknown")[0], 404)
        self.assertEqual(self.request(headers={"Content-Type": "text/plain"})[0], 415)
        self.assertEqual(self.request(raw="{oops")[0], 400)
        self.assertEqual(self.request(body=[])[0], 400)
        self.assertEqual(self.request(raw="x" * (server_module.MAX_BODY + 1))[0], 413)
        self.assertEqual(self.request(headers={"Content-Length": "-1"})[0], 413)
        self.assertEqual(self.request(headers={"Transfer-Encoding": "chunked"})[0], 411)
        self.assertEqual(self.calls, [])

    def test_input_voice_format_profile_and_pace_are_validated(self):
        for body in ({"input": ""}, {"input": 1}, {"input": "x" * 2401}, {"input": "\ud800"},
                     {"input": "Olá", "voice": "pf_dora"}, {"input": "Olá", "response_format": "mp3"},
                     {"input": "Olá", "profile": None}, {"input": "Olá", "pace": "fast"}):
            with self.subTest(keys=list(body)):
                self.assertEqual(self.request(body=body)[0], 400)
        self.assertEqual(self.calls, [])

    def test_pcm_response_and_cache_identity_include_original_text_profile_and_pace(self):
        bodies = [{"input": "Lumi lê BA-NA-NA."},
                  {"input": "Lumi lê BA-NA-NA.", "profile": "conversation"},
                  {"input": "Lumi lê BA-NA-NA.", "profile": "conversation", "pace": "calm"}]
        for body in bodies + bodies:
            status, headers, audio = self.request(body=body)
            self.assertEqual(status, 200)
            self.assertEqual(headers["Content-Type"], "audio/wav")
            self.assertEqual(headers["Cache-Control"], "no-store, private")
            self.assertEqual(audio, self.audio)
        self.assertEqual(self.calls, [("Lumi lê BA-NA-NA.", "reading", "natural"),
                                     ("Lumi lê BA-NA-NA.", "conversation", "natural"),
                                     ("Lumi lê BA-NA-NA.", "conversation", "calm")])
        self.assertTrue(all(len(key) == 64 for key in self.server.cache))

    def wait_for(self, predicate, timeout=1):
        deadline = time.monotonic() + timeout
        while not predicate() and time.monotonic() < deadline:
            time.sleep(0.005)
        self.assertTrue(predicate())

    def test_waiting_is_bounded_and_health_remains_available_while_busy(self):
        self.server.synthesis_lock.acquire()
        try:
            with patch.object(server_module, "QUEUE_WAIT_SECONDS", 0.04):
                status, headers, body = self.request()
                self.assertEqual(status, 503)
                self.assertEqual(headers["Retry-After"], "2")
                self.assertEqual(json.loads(body)["code"], "SPEECH_BUSY")
            self.assertEqual(self.request("/health", method="GET")[0], 200)
            self.assertFalse(self.server.pending)
        finally:
            self.server.release_turn()
        self.assertEqual(self.calls, [])

    def test_deadlines_incomplete_generation_and_failures_never_enter_cache(self):
        for error, expected in [(SpeechTimeout("private timeout"), 504), (InvalidSpeech("private partial"), 422),
                                (RuntimeError("secret prompt and token"), 503)]:
            def broken(*_args):
                raise error
            self.server.synthesize = broken
            status, _, body = self.request()
            self.assertEqual(status, expected)
            self.assertNotIn(b"private", body)
            self.assertNotIn(b"secret", body)
            self.assertEqual(len(self.server.cache), 0)
            self.assertFalse(self.server.synthesis_lock.locked())
        self.server.synthesize = lambda *_: b"partial-wave"
        self.assertEqual(self.request()[0], 422)
        self.assertEqual(len(self.server.cache), 0)

    def test_expired_control_is_rechecked_even_if_a_synthesizer_returns_audio(self):
        def too_late(_text, _profile, _pace, control):
            control.deadline = control.clock() - 1
            return self.audio
        self.server.synthesize = too_late
        self.assertEqual(self.request()[0], 504)
        self.assertEqual(len(self.server.cache), 0)

    def test_disconnecting_cancels_the_active_job_and_releases_the_lock(self):
        started, finished = threading.Event(), threading.Event()
        def wait_for_cancel(_text, _profile, _pace, control):
            started.set()
            try:
                end = time.monotonic() + 2
                while time.monotonic() < end:
                    control.check()
                    time.sleep(0.005)
                raise RuntimeError("Cancellation did not arrive")
            finally:
                finished.set()
        self.server.synthesize = wait_for_cancel
        connection = socket.create_connection(("127.0.0.1", self.server.server_port), timeout=2)
        payload = json.dumps({"input": "Uma descoberta."}).encode()
        headers = (f"POST /v1/audio/speech HTTP/1.1\r\nHost: 127.0.0.1:{self.server.server_port}\r\n"
                   f"Authorization: Bearer {self.token}\r\nContent-Type: application/json\r\nContent-Length: {len(payload)}\r\n\r\n").encode()
        try:
            connection.sendall(headers + payload)
            self.assertTrue(started.wait(1))
        finally:
            connection.close()
        self.assertTrue(finished.wait(1))
        deadline = time.monotonic() + 1
        while self.server.synthesis_lock.locked() and time.monotonic() < deadline:
            time.sleep(0.005)
        self.assertFalse(self.server.synthesis_lock.locked())
        self.assertEqual(len(self.server.cache), 0)

    def test_cache_limits_are_enforced_by_item_count_and_bytes(self):
        for index in range(server_module.MAX_CACHE_ITEMS + 2):
            self.server.remember(str(index), self.audio)
        self.assertEqual(len(self.server.cache), server_module.MAX_CACHE_ITEMS)
        self.assertEqual(self.server.cache_bytes, server_module.MAX_CACHE_ITEMS * len(self.audio))
        self.assertIsNone(self.server.cached("0"))
        large = b"x" * (4 * 1024 * 1024)
        for index in range(6):
            self.server.remember("large-" + str(index), large)
        self.assertLessEqual(self.server.cache_bytes, server_module.MAX_CACHE)
        self.assertLessEqual(len(self.server.cache), server_module.MAX_CACHE_ITEMS)

    def test_cancel_endpoint_has_the_same_auth_origin_host_and_body_validation(self):
        identifier = "a" * 64
        for headers, expected in [({"Authorization": None}, 401),
                                  ({"Authorization": "Bearer bad"}, 401),
                                  ({"Origin": "null"}, 403), ({"Host": "other.example"}, 403)]:
            self.assertEqual(self.request("/v1/audio/cancel", {"request_id": identifier}, headers)[0], expected)
        for value in (None, "short", "g" * 64, "a" * 65, 123, [], " " + identifier):
            for path, body in [("/v1/audio/cancel", {"request_id": value}),
                               ("/v1/audio/speech", {"input": "Olá", "request_id": value})]:
                self.assertEqual(self.request(path, body)[0], 400)
        self.assertEqual(self.request("/v1/audio/cancel", {})[0], 400)
        self.assertFalse(self.server.cancelled_ids)
        self.assertEqual(self.calls, [])

    def test_cancel_before_post_is_idempotent_and_checked_before_cached_audio(self):
        identifier = "ab" * 32
        self.assertEqual(self.request(body={"input": "Uma ilha."})[0], 200)
        for _ in range(2):
            status, headers, data = self.request("/v1/audio/cancel", {"request_id": identifier.upper()})
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(data), {"ok": True})
            self.assertEqual(headers["Cache-Control"], "no-store, private")
        for words in ("Uma ilha.", "Uma nova trilha."):
            status, _, data = self.request(body={"input": words, "request_id": identifier})
            self.assertEqual(status, 409)
            self.assertEqual(json.loads(data)["code"], "SPEECH_CANCELLED")
            self.assertNotIn(identifier.encode(), data)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(self.server.cache), 1)
        self.assertFalse(self.server.synthesis_lock.locked())

    def test_explicit_cancel_stops_only_the_matching_active_request(self):
        identifier, unrelated = "1" * 64, "2" * 64
        started = threading.Event()
        def generating(_text, _profile, _pace, control):
            started.set()
            end = time.monotonic() + 2
            while time.monotonic() < end:
                control.check()
                time.sleep(0.005)
            raise RuntimeError("Cancel did not reach generation")
        self.server.synthesize = generating
        with ThreadPoolExecutor(max_workers=1) as executor:
            running = executor.submit(self.request, body={"input": "Estou explorando.", "request_id": identifier})
            self.assertTrue(started.wait(1))
            try:
                self.assertEqual(self.request("/v1/audio/cancel", {"request_id": unrelated})[0], 200)
                self.assertFalse(running.done())
                self.assertEqual(self.request("/health", method="GET")[0], 200)
            finally:
                self.request("/v1/audio/cancel", {"request_id": identifier})
            result = running.result(timeout=2)
        self.assertEqual(result[0], 409)
        self.assertEqual(json.loads(result[2])["code"], "SPEECH_CANCELLED")
        self.assertFalse(self.server.cache)
        self.assertFalse(self.server.synthesis_lock.locked())

    def test_queued_cancel_removes_the_ticket_without_starting_synthesis(self):
        identifier = "3" * 64
        self.server.synthesis_lock.acquire()
        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                waiting = executor.submit(self.request, body={"input": "Mais uma ilha.", "request_id": identifier})
                self.wait_for(lambda: len(self.server.pending) == 1)
                self.assertEqual(self.request("/v1/audio/cancel", {"request_id": identifier})[0], 200)
                status, _, data = waiting.result(timeout=2)
                self.assertEqual(status, 409)
                self.assertEqual(json.loads(data)["code"], "SPEECH_CANCELLED")
                self.assertFalse(self.server.pending)
                self.assertTrue(self.server.synthesis_lock.locked())
        finally:
            self.server.release_turn()
        self.assertEqual(self.calls, [])

    def test_disconnecting_while_queued_removes_the_ticket_without_an_id(self):
        self.server.synthesis_lock.acquire()
        connection = socket.create_connection(("127.0.0.1", self.server.server_port), timeout=2)
        payload = json.dumps({"input": "Uma descoberta na fila."}).encode()
        headers = (f"POST /v1/audio/speech HTTP/1.1\r\nHost: 127.0.0.1:{self.server.server_port}\r\n"
                   f"Authorization: Bearer {self.token}\r\nContent-Type: application/json\r\nContent-Length: {len(payload)}\r\n\r\n").encode()
        try:
            connection.sendall(headers + payload)
            self.wait_for(lambda: len(self.server.pending) == 1)
            connection.close()
            self.wait_for(lambda: not self.server.pending)
        finally:
            connection.close()
            self.server.release_turn()
        self.assertEqual(self.calls, [])

    def test_fifo_allows_two_pending_requests_and_never_two_generations(self):
        started, release = threading.Event(), threading.Event()
        state_lock = threading.Lock()
        order, simultaneous = [], [0, 0]
        def generating(words, _profile, _pace, control):
            with state_lock:
                simultaneous[0] += 1
                simultaneous[1] = max(simultaneous)
                order.append(words)
            try:
                if words == "Primeira":
                    started.set()
                    if not release.wait(2):
                        raise RuntimeError("Test generation was not released")
                control.check()
                return self.audio
            finally:
                with state_lock:
                    simultaneous[0] -= 1
        self.server.synthesize = generating
        with ThreadPoolExecutor(max_workers=3) as executor:
            first = executor.submit(self.request, body={"input": "Primeira"})
            self.assertTrue(started.wait(1))
            try:
                second = executor.submit(self.request, body={"input": "Segunda"})
                self.wait_for(lambda: len(self.server.pending) == 1)
                third = executor.submit(self.request, body={"input": "Terceira"})
                self.wait_for(lambda: len(self.server.pending) == 2)
                status, headers, data = self.request(body={"input": "Quarta"})
                self.assertEqual(status, 503)
                self.assertEqual(headers["Retry-After"], "2")
                self.assertEqual(json.loads(data)["code"], "SPEECH_BUSY")
                self.assertEqual(self.request("/health", method="GET")[0], 200)
            finally:
                release.set()
            self.assertEqual([future.result(timeout=2)[0] for future in (first, second, third)], [200, 200, 200])
        self.assertEqual(order, ["Primeira", "Segunda", "Terceira"])
        self.assertEqual(simultaneous, [0, 1])
        self.assertFalse(self.server.pending)

    def test_waiting_identical_text_reuses_the_completed_cache_without_another_generation(self):
        started, release = threading.Event(), threading.Event()
        def generating(words, profile, pace, control):
            self.calls.append((words, profile, pace))
            started.set()
            if not release.wait(2):
                raise RuntimeError("Test generation was not released")
            control.check()
            return self.audio
        self.server.synthesize = generating
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(self.request, body={"input": "Vamos explorar.", "request_id": "4" * 64})
            self.assertTrue(started.wait(1))
            try:
                second = executor.submit(self.request, body={"input": "Vamos explorar.", "request_id": "5" * 64})
                self.wait_for(lambda: len(self.server.pending) == 1)
            finally:
                release.set()
            results = [first.result(timeout=2), second.result(timeout=2)]
        self.assertEqual([result[0] for result in results], [200, 200])
        self.assertEqual([result[2] for result in results], [self.audio, self.audio])
        self.assertEqual(len(self.calls), 1)

    def test_waiting_consumes_the_original_generation_budget(self):
        now, remaining = [1000.0], []
        self.server.clock = lambda: now[0]
        self.server.synthesis_lock.acquire()
        def generating(_text, _profile, _pace, control):
            remaining.append(control.deadline - control.clock())
            control.check()
            return self.audio
        self.server.synthesize = generating
        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                waiting = executor.submit(self.request)
                self.wait_for(lambda: len(self.server.pending) == 1)
                now[0] += 7
                self.server.release_turn()
                self.assertEqual(waiting.result(timeout=2)[0], 200)
        finally:
            self.server.clock = time.monotonic
            if self.server.synthesis_lock.locked():
                self.server.release_turn()
        self.assertEqual(remaining, [server_module.GENERATION_SECONDS - 7])

    def test_total_deadline_can_expire_in_the_queue_without_starting_synthesis(self):
        self.server.synthesis_lock.acquire()
        try:
            with patch.object(server_module, "GENERATION_SECONDS", 0.04), patch.object(server_module, "QUEUE_WAIT_SECONDS", 1):
                self.assertEqual(self.request()[0], 504)
            self.assertFalse(self.server.pending)
        finally:
            self.server.release_turn()
        self.assertEqual(self.calls, [])
        self.assertFalse(self.server.cache)

    def test_tombstones_expire_are_bounded_and_eviction_does_not_uncancel_live_jobs(self):
        now = [1000.0]
        self.server.clock = lambda: now[0]
        identifier = "f" * 64
        event = self.server.register_request(identifier)
        try:
            self.server.cancel_request(identifier)
            for index in range(server_module.MAX_CANCELLED_IDS + 1):
                self.server.cancel_request(f"{index:064x}")
            self.assertEqual(len(self.server.cancelled_ids), server_module.MAX_CANCELLED_IDS)
            self.assertNotIn(identifier, self.server.cancelled_ids)
            self.assertTrue(event.is_set())
            self.assertTrue(all(len(key) == 64 and isinstance(expiry, float) for key, expiry in self.server.cancelled_ids.items()))
            now[0] += server_module.CANCEL_TTL_SECONDS + 1
            fresh = self.server.register_request("e" * 64)
            self.assertFalse(fresh.is_set())
            self.assertFalse(self.server.cancelled_ids)
            self.server.unregister_request("e" * 64, fresh)
        finally:
            self.server.unregister_request(identifier, event)
            self.server.clock = time.monotonic

    def test_cancelled_result_is_rechecked_and_never_cached_even_if_synthesis_returns(self):
        identifier = "6" * 64
        def generating(*_args):
            self.server.cancel_request(identifier)
            return self.audio
        self.server.synthesize = generating
        status, _, data = self.request(body={"input": "Concluindo uma fala.", "request_id": identifier})
        self.assertEqual(status, 409)
        self.assertEqual(json.loads(data)["code"], "SPEECH_CANCELLED")
        self.assertFalse(self.server.cache)
        self.assertFalse(self.server.synthesis_lock.locked())

    def test_cancel_wins_before_validation_of_an_invalid_returned_output(self):
        identifier = "7" * 64
        def generating(*_args):
            self.server.cancel_request(identifier)
            return b"unfinished audio"
        self.server.synthesize = generating
        status, _, data = self.request(body={"input": "Uma fala interrompida.", "request_id": identifier})
        self.assertEqual(status, 409)
        self.assertEqual(json.loads(data)["code"], "SPEECH_CANCELLED")
        self.assertFalse(self.server.cache)
        self.assertFalse(self.server.synthesis_lock.locked())

    def test_synthesis_slot_is_released_before_audio_is_written_to_http(self):
        states = []
        original = server_module.SpeechHandler.respond
        def observe(handler, status, payload, media_type="application/json", **kwargs):
            if media_type == "audio/wav":
                states.append(handler.server.synthesis_lock.locked())
            return original(handler, status, payload, media_type, **kwargs)
        with patch.object(server_module.SpeechHandler, "respond", observe):
            self.assertEqual(self.request()[0], 200)
        self.assertEqual(states, [False])

    def test_streaming_sends_first_pcm_before_synthesis_finishes_and_caches_only_completed_audio(self):
        release = threading.Event()
        pcm = b"\x01\x02" * 240
        def stream(_text, _profile, _pace, control):
            yield pcm
            if not release.wait(2):
                raise RuntimeError("Test was not released")
            control.check()
            yield pcm
        self.server.synthesize.streaming = True
        self.server.synthesize.synthesize_stream = stream
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        connection.request("POST", "/v1/audio/speech", json.dumps({"input": "Uma trilha.", "response_format": "pcm_stream"}),
                           {"Authorization": "Bearer " + self.token, "Content-Type": "application/json"})
        try:
            response = connection.getresponse()
            self.assertEqual(response.status, 200)
            self.assertEqual(response.getheader("Content-Type"), "application/x-ndjson")
            self.assertEqual(json.loads(response.readline())["type"], "start")
            self.assertEqual(base64.b64decode(json.loads(response.readline())["data"]), pcm)
            self.assertFalse(self.server.cache)
            release.set()
            tail = [json.loads(line) for line in response.read().splitlines()]
            self.assertEqual([event["type"] for event in tail], ["audio", "end"])
            self.assertEqual(len(self.server.cache), 1)
            self.assertFalse(self.server.synthesis_lock.locked())
        finally:
            release.set()
            connection.close()
        self.server.synthesize = lambda *_: self.fail("Cached speech must not be synthesized")
        status, _, body = self.request(body={"input": "Uma trilha.", "response_format": "pcm_stream"})
        self.assertEqual(status, 200)
        events = [json.loads(line) for line in body.splitlines()]
        self.assertEqual([event["type"] for event in events], ["start", "audio", "end"])
        self.assertEqual(base64.b64decode(events[1]["data"]), pcm * 2)

    def test_partial_stream_failure_has_error_without_end_or_cache(self):
        def stream(*_):
            yield b"\x01\x02" * 240
            raise InvalidSpeech("private incomplete EOS")
        self.server.synthesize.streaming = True
        self.server.synthesize.synthesize_stream = stream
        status, _, body = self.request(body={"input": "Uma frase.", "response_format": "pcm_stream"})
        self.assertEqual(status, 200)
        events = [json.loads(line) for line in body.splitlines()]
        self.assertEqual([event["type"] for event in events], ["start", "audio", "error"])
        self.assertEqual(events[-1]["code"], "SPEECH_INVALID")
        self.assertNotIn(b"private", body)
        self.assertFalse(self.server.cache)
        self.assertFalse(self.server.synthesis_lock.locked())

    def test_invalid_stream_pcm_and_empty_stream_never_complete(self):
        for values in ([b"odd"], [], [b""], [b"\0\0" * (server_module.MAX_SECONDS * SAMPLE_RATE + 1)]):
            self.server.synthesize.streaming = True
            self.server.synthesize.synthesize_stream = lambda *_: iter(values)
            self.assertEqual(self.request(body={"input": "Teste", "response_format": "pcm_stream"})[0], 422)
            self.assertFalse(self.server.cache)
            self.assertFalse(self.server.synthesis_lock.locked())

    def test_nonstreaming_runtime_rejects_uncached_stream_requests(self):
        status, _, body = self.request(body={"input": "Uma pergunta.", "response_format": "pcm_stream"})
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)["code"], "STREAMING_UNAVAILABLE")
        self.assertFalse(self.calls)

    def test_stream_cancel_stops_generator_without_end_and_releases_slot(self):
        identifier = "9" * 64
        closed = threading.Event()
        def stream(_text, _profile, _pace, control):
            try:
                yield b"\x01\x02" * 240
                self.server.cancel_request(identifier)
                control.check()
            finally:
                closed.set()
        self.server.synthesize.streaming = True
        self.server.synthesize.synthesize_stream = stream
        status, _, body = self.request(body={"input": "Mais uma pergunta.", "response_format": "pcm_stream", "request_id": identifier})
        self.assertEqual(status, 200)
        events = [json.loads(line) for line in body.splitlines()]
        self.assertEqual(events[-1], {"type": "error", "code": "SPEECH_CANCELLED"})
        self.assertNotIn("end", [event["type"] for event in events])
        self.assertTrue(closed.is_set())
        self.assertFalse(self.server.cache)
        self.assertFalse(self.server.synthesis_lock.locked())

    def test_service_refuses_public_binding_weak_secrets_and_unknown_devices(self):
        for address, token, device in [(("0.0.0.0", 0), self.token, "cpu"), (("127.0.0.1", 0), "short", "cpu"),
                                       (("127.0.0.1", 0), "x " * 40, "cpu"), (("127.0.0.1", 0), self.token, "remote")]:
            with self.assertRaises(ValueError): SpeechServer(address, token, lambda *_: self.audio, device)


if __name__ == "__main__":
    unittest.main()
