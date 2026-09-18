"""Install Qwen VoiceDesign locally from pinned, SHA256-verified public files."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request

SERVICE_ROOT = Path(__file__).resolve().parents[1]
# The same source runs inside services/lumi-voice or as a standalone checkout.
# Require the application manifest before placing private files outside this service.
_repository = SERVICE_ROOT.parent.parent
IS_MONOREPO = SERVICE_ROOT.parent.name == "services" and (_repository / "apps/plataforma/package.json").is_file()
ROOT = _repository if IS_MONOREPO else SERVICE_ROOT
APP_ROOT = ROOT / "apps/plataforma" if IS_MONOREPO else SERVICE_ROOT
VENV = ROOT / ".venv-qwen"
PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
MODELS = SERVICE_ROOT / "models/voice-design"
MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
REVISION = "5ecdb67327fd37bb2e042aab12ff7391903235d3"
BASE = "https://huggingface.co/" + MODEL + "/resolve/" + REVISION + "/"
ASSETS = {
 "model.safetensors": (3833402552, "391e8db219f292c515297cdceeb43e4eae67cdde35fa57e79a6a8a532fca0522"),
 "speech_tokenizer/model.safetensors": (682293092, "836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258"),
 "config.json": (4421, "aecd2cc4c1fe9edef1cb7ca7c401685a43879ad43f3f9e883f1c6760b61731e0"),
 "generation_config.json": (245, "f1b90b4513f3b34c62851049e2492d7b4c5940daf1276f89c82b8ef04127f3aa"),
 "merges.txt": (1671839, "599bab54075088774b1733fde865d5bd747cbcc7a547c5bc12610e874e26f5e3"),
 "preprocessor_config.json": (127, "efdde1022ea9d76928bf7a9cd53139138f5ba2e466e837f08f6105ab1af1c119"),
 "speech_tokenizer/config.json": (2336, "ee65bb901c876664ab8707c487157aa1a6ee57c65969b28fb5ec9dc211e68167"),
 "speech_tokenizer/configuration.json": (76, "6bc26d64eb5024b4d1dab5a52371958b429256d6c9d59787f1f5294a54e0cebd"),
 "speech_tokenizer/preprocessor_config.json": (234, "fcb3805e597e786d4067706e602f6688524640f8d3396790e2e09b5942fcbdfb"),
 "tokenizer_config.json": (7344, "dc3c31c3bdaedd5016382bb3cbe07323026775ad51f5a4fb564505992ae4a670"),
 "vocab.json": (2776833, "ca10d7e9fb3ed18575dd1e277a2579c16d108e32f27439684afa0e10b1440910"),
}

def verified(path: Path, size: int, digest: str) -> bool:
 if not path.is_file() or path.stat().st_size != size:
  return False
 value = hashlib.sha256()
 with path.open("rb") as source:
  for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
   value.update(chunk)
 return value.hexdigest() == digest

def download(item: tuple[str, tuple[int, str]]) -> None:
 name, (size, digest) = item
 target = MODELS / name
 target.parent.mkdir(parents=True, exist_ok=True)
 if verified(target, size, digest):
  print("Verified " + name, flush=True)
  return
 partial = target.with_name(target.name + ".part")
 for attempt in range(3):
  try:
   request = urllib.request.Request(BASE + name, headers={"User-Agent": "Letria-Qwen-Setup/1.0"})
   downloaded = 0
   checkpoint = 0
   value = hashlib.sha256()
   with urllib.request.urlopen(request, timeout=90) as response, partial.open("wb") as output:
    length = response.headers.get("Content-Length")
    if length and int(length) != size:
     raise RuntimeError("Unexpected model file length")
    while True:
     data = response.read(4 * 1024 * 1024)
     if not data:
      break
     downloaded += len(data)
     if downloaded > size:
      raise RuntimeError("Model file exceeds its declared size")
     value.update(data)
     output.write(data)
     progress = downloaded * 100 // size
     if size > 100_000_000 and progress >= checkpoint + 10:
      checkpoint = progress
      print(name + ": " + str(progress) + "%", flush=True)
   if downloaded != size or value.hexdigest() != digest:
    raise RuntimeError("Model SHA256 validation failed")
   partial.replace(target)
   print("Verified " + name, flush=True)
   return
  except (OSError, ValueError, RuntimeError):
   if attempt == 2:
    raise RuntimeError("Could not verify " + name) from None
   print("Retrying " + name, flush=True)
   time.sleep(2)

def main() -> None:
 parser = argparse.ArgumentParser(description=__doc__)
 parser.add_argument("--download-only", action="store_true")
 parser.add_argument("--cpu", action="store_true", help="Install a CPU-only PyTorch runtime")
 args = parser.parse_args()
 if sys.version_info < (3, 12) or sys.version_info >= (3, 13):
  raise SystemExit("Use Python 3.12 for the isolated Qwen runtime.")
 if shutil.disk_usage(ROOT).free < 12 * 1024**3:
  raise SystemExit("Reserve at least 12 GB of disk space for Qwen and its runtime.")
 if not args.download_only:
  if not PYTHON.exists():
   subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)
  gpu = not args.cpu and shutil.which("nvidia-smi") is not None
  index = "https://download.pytorch.org/whl/" + ("cu128" if gpu else "cpu")
  subprocess.run([str(PYTHON), "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "torch==2.10.0", "torchaudio==2.10.0", "--index-url", index], check=True)
  subprocess.run([str(PYTHON), "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "-r", str(SERVICE_ROOT / "requirements.txt")], check=True)
 MODELS.mkdir(parents=True, exist_ok=True)
 with ThreadPoolExecutor(max_workers=2) as pool:
  list(pool.map(download, ASSETS.items()))
 (MODELS / ".verified.json").write_text(json.dumps({"model": MODEL, "revision": REVISION, "sha256": {name: value[1] for name, value in ASSETS.items()}}, indent=2), encoding="utf-8")
 configuration = APP_ROOT / ".env.qwen.local"
 if not configuration.exists():
  configuration.write_text("TTS_PROVIDER=qwen\nQWEN_TTS_URL=http://127.0.0.1:8766\nQWEN_TTS_API_TOKEN=" + secrets.token_hex(32) + "\n", encoding="utf-8")
 print("Qwen VoiceDesign files verified. Local configuration is private; no service has been published.", flush=True)

if __name__ == "__main__":
 main()
