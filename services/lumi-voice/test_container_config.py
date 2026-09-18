"""Network and startup contracts for local use and private container networks."""
import contextlib
import http.client
import importlib.util
import io
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import threading
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).parent))
_spec = importlib.util.spec_from_file_location("letria_container_voice", Path(__file__).with_name("server.py"))
server = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(server)
import healthcheck

TOKEN = "fictional-contract-token-" + "x" * 40


class ContainerConfigurationTests(unittest.TestCase):
    def test_defaults_preserve_loopback_and_relative_voice_reference(self):
        with TemporaryDirectory() as folder:
            model = Path(folder) / "models/base"
            config = server.voice_configuration({"QWEN_TTS_API_TOKEN": TOKEN, "QWEN_TTS_MODEL_DIR": str(model)})
            self.assertEqual((config["host"], config["port"], config["device"]), ("127.0.0.1", 8766, "auto"))
            self.assertFalse(config["allowed_hosts"])
            self.assertEqual(config["reference_dir"], Path(folder).resolve() / "voices/lumi")

    def test_explicit_container_environment_selects_only_named_hosts_and_volumes(self):
        with TemporaryDirectory() as folder:
            volume = Path(folder).resolve()
            config = server.voice_configuration({
                "QWEN_TTS_API_TOKEN": TOKEN, "QWEN_TTS_HOST": "0.0.0.0", "QWEN_TTS_PORT": "8767",
                "QWEN_TTS_ALLOWED_HOSTS": " projeto_letria-voice:8767, VOICE.EXAMPLE.TEST ",
                "QWEN_TTS_DEVICE": "cpu", "QWEN_TTS_MODEL_DIR": str(volume / "models/base"),
                "QWEN_TTS_REFERENCE_DIR": str(volume / "reference"), "QWEN_TTS_CACHE_DIR": str(volume / "cache"),
            })
            self.assertEqual(config["host"], "0.0.0.0")
            self.assertEqual(config["port"], 8767)
            self.assertEqual(config["allowed_hosts"], {"projeto_letria-voice:8767", "voice.example.test"})
            self.assertEqual(config["reference_dir"], volume / "reference")
            self.assertEqual(config["cache_dir"], volume / "cache")

    def test_invalid_binding_hosts_ports_devices_and_tokens_fail_closed(self):
        invalid = [
            {"QWEN_TTS_HOST": "0.0.0.0"}, {"QWEN_TTS_HOST": "public.example"},
            {"QWEN_TTS_ALLOWED_HOSTS": "*"}, {"QWEN_TTS_ALLOWED_HOSTS": "*.example.test"},
            {"QWEN_TTS_ALLOWED_HOSTS": "https://voice.example.test"}, {"QWEN_TTS_ALLOWED_HOSTS": "user@voice:8766"},
            {"QWEN_TTS_ALLOWED_HOSTS": "voice:8766/path"}, {"QWEN_TTS_ALLOWED_HOSTS": "voice:0"},
            {"QWEN_TTS_ALLOWED_HOSTS": "voice:65536"}, {"QWEN_TTS_ALLOWED_HOSTS": "voice:8766,"},
            {"QWEN_TTS_ALLOWED_HOSTS": "voice:8766\r\nHost: evil.test"},
            {"QWEN_TTS_PORT": "0"}, {"QWEN_TTS_PORT": "65536"}, {"QWEN_TTS_PORT": "text"},
            {"QWEN_TTS_DEVICE": "remote"}, {"QWEN_TTS_API_TOKEN": "short"}, {"QWEN_TTS_API_TOKEN": "x " * 40},
        ]
        for changed in invalid:
            with self.subTest(keys=tuple(changed)):
                with self.assertRaises(ValueError):
                    server.voice_configuration({"QWEN_TTS_API_TOKEN": TOKEN, **changed})

    def test_container_binding_requires_explicit_hosts_without_opening_a_public_test_socket(self):
        allowed = frozenset({"private_voice:8766"})
        with self.assertRaises(ValueError):
            server.SpeechServer(("0.0.0.0", 8766), TOKEN, lambda *_: b"", "cpu")
        def fake_init(instance, address, handler):
            self.assertEqual(address, ("0.0.0.0", 8766))
            instance.server_port = address[1]
        with patch.object(server.ThreadingHTTPServer, "__init__", fake_init):
            configured = server.SpeechServer(("0.0.0.0", 8766), TOKEN, lambda *_: b"", "cpu", allowed_hosts=allowed)
        self.assertEqual(configured.allowed_hosts, {"private_voice:8766", "127.0.0.1:8766", "localhost:8766"})

    def test_missing_model_fails_before_loading_runtime_or_downloading(self):
        with TemporaryDirectory() as folder, patch.dict(server.os.environ, {
            "QWEN_TTS_API_TOKEN": TOKEN, "QWEN_TTS_MODEL_DIR": folder,
        }, clear=True), patch.object(server, "load_synthesizer") as loader:
            with self.assertRaisesRegex(SystemExit, "startup never downloads weights"):
                server.main()
            loader.assert_not_called()


class ContainerHostTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = server.SpeechServer(("127.0.0.1", 0), TOKEN, lambda *_: b"", "cpu", allowed_hosts=frozenset({"private_voice:8766"}))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, path="/health", method="GET", headers=None, duplicates=False):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=3)
        outgoing = {"Host": "private_voice:8766", "Authorization": "Bearer " + TOKEN, **(headers or {})}
        try:
            connection.putrequest(method, path, skip_host=True)
            for key, value in outgoing.items():
                if value is not None:
                    connection.putheader(key, value)
            if duplicates:
                connection.putheader("Host", "private_voice:8766")
            connection.endheaders()
            response = connection.getresponse()
            response.read()
            return response.status
        finally:
            connection.close()

    def test_exact_container_host_is_accepted_but_subdomains_ports_origins_and_duplicates_are_denied(self):
        self.assertEqual(self.request(), 200)
        self.assertEqual(self.request(headers={"Host": "PRIVATE_VOICE:8766"}), 200)
        for changed in ({"Host": "other:8766"}, {"Host": "private_voice:8767"}, {"Host": "private_voice:8766.evil.test"},
                        {"Origin": "null"}, {"Origin": "https://school.example.test"}):
            with self.subTest(headers=changed):
                self.assertEqual(self.request(headers=changed), 403)
        self.assertEqual(self.request(duplicates=True), 403)
        self.assertEqual(self.request(method="OPTIONS"), 403)

    def test_container_host_never_bypasses_authentication_for_any_endpoint(self):
        for path, method in [("/health", "GET"), ("/v1/audio/prepare/" + "a" * 32, "GET"),
                             ("/v1/audio/speech", "POST"), ("/v1/audio/prepare", "POST"), ("/v1/audio/cancel", "POST")]:
            for token in (None, "Bearer wrong"):
                with self.subTest(path=path, method=method):
                    self.assertEqual(self.request(path, method, {"Authorization": token}), 401)

    def test_health_probe_uses_loopback_authentication_and_emits_no_output(self):
        stream = io.StringIO()
        with contextlib.redirect_stdout(stream), contextlib.redirect_stderr(stream):
            self.assertTrue(healthcheck.healthy({"QWEN_TTS_API_TOKEN": TOKEN, "QWEN_TTS_PORT": str(self.server.server_port)}))
            self.assertFalse(healthcheck.healthy({"QWEN_TTS_API_TOKEN": "short"}))
            self.assertFalse(healthcheck.healthy({"QWEN_TTS_API_TOKEN": "wrong-" + "x" * 40, "QWEN_TTS_PORT": str(self.server.server_port)}))
        self.assertEqual(stream.getvalue(), "")

    def test_health_probe_does_not_follow_redirects(self):
        connection = Mock()
        connection.getresponse.return_value.status = 302
        with patch.object(healthcheck.http.client, "HTTPConnection", return_value=connection):
            self.assertFalse(healthcheck.healthy({"QWEN_TTS_API_TOKEN": TOKEN}))
        connection.request.assert_called_once_with("GET", "/health", headers={"Authorization": "Bearer " + TOKEN})
        connection.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
