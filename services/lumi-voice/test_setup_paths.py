"""Installers must contain private files in the intended checkout in either layout."""
import importlib.util
import os
from pathlib import Path
import shutil
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parent / "scripts"


def load_installer(service, name):
    path = service / "scripts" / ("setup-" + name + ".py")
    spec = importlib.util.spec_from_file_location("layout_check_" + name.replace("-", "_"), path)
    module = importlib.util.module_from_spec(spec)
    with patch("subprocess.run", side_effect=AssertionError("Import must not install packages")), patch("urllib.request.urlopen", side_effect=AssertionError("Import must not download models")):
        spec.loader.exec_module(module)
    return module


class SetupPathsTests(unittest.TestCase):
    def copy_installers(self, service):
        (service / "scripts").mkdir(parents=True)
        for name in ("setup-qwen.py", "setup-qwen-base.py"):
            shutil.copyfile(SCRIPTS / name, service / "scripts" / name)

    def assert_layout(self, service, runtime_root, config_root, monorepo):
        qwen = load_installer(service, "qwen")
        base = load_installer(service, "qwen-base")
        self.assertEqual(qwen.IS_MONOREPO, monorepo)
        self.assertEqual(qwen.ROOT, runtime_root)
        self.assertEqual(base.ROOT, runtime_root)
        self.assertEqual(qwen.APP_ROOT, config_root)
        self.assertEqual(qwen.VENV, runtime_root / ".venv-qwen")
        self.assertEqual(qwen.PYTHON, qwen.VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python"))
        self.assertEqual(qwen.MODELS, service / "models/voice-design")
        self.assertEqual(base.MODELS, service / "models/base")
        self.assertEqual(base.SOURCE_MODELS, qwen.MODELS)
        self.assertFalse(qwen.VENV.exists())
        self.assertFalse(qwen.MODELS.exists())
        self.assertFalse((config_root / ".env.qwen.local").exists())

    def test_monorepo_preserves_root_runtime_and_app_configuration(self):
        with TemporaryDirectory() as folder:
            repository = Path(folder).resolve()
            service = repository / "services/lumi-voice"
            app = repository / "apps/plataforma"
            app.mkdir(parents=True)
            (app / "package.json").write_text("{}", encoding="utf-8")
            self.copy_installers(service)
            self.assert_layout(service, repository, app, True)

    def test_standalone_keeps_runtime_and_configuration_in_its_checkout(self):
        with TemporaryDirectory() as folder:
            service = Path(folder).resolve() / "letria-voice"
            self.copy_installers(service)
            self.assert_layout(service, service, service, False)

    def test_services_directory_alone_does_not_select_a_parent_repository(self):
        with TemporaryDirectory() as folder:
            service = Path(folder).resolve() / "services/lumi-voice"
            self.copy_installers(service)
            self.assert_layout(service, service, service, False)


if __name__ == "__main__":
    unittest.main()
