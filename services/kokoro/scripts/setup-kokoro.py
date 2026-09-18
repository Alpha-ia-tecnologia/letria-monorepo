"""Install the isolated Dora runtime and verify the upstream model downloads."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import sys
import urllib.request

SERVICE_ROOT = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[3]
APP_ROOT = ROOT / "apps/plataforma"
VENV = ROOT / ".venv-kokoro"
PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
MODELS = SERVICE_ROOT / "models"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/"
ASSETS = {
    "kokoro-v1.0.onnx": (325505369, "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a"),
    "voices-v1.0.bin": (28214398, "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"),
}

def valid_file(path: Path, size: int, digest: str) -> bool:
    if not path.is_file() or path.stat().st_size != size:
        return False
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest() == digest

def download_models() -> None:
    MODELS.mkdir(parents=True, exist_ok=True)
    for name, (size, digest) in ASSETS.items():
        target = MODELS / name
        if valid_file(target, size, digest):
            print(name + ": verificado, download dispensado.", flush=True)
            continue
        partial = target.with_suffix(target.suffix + ".part")
        print("Baixando " + name + " (" + str(round(size / 1024**2)) + " MB)...", flush=True)
        request = urllib.request.Request(RELEASE + name, headers={"User-Agent": "Letria-Kokoro-Setup"})
        with urllib.request.urlopen(request, timeout=60) as response, partial.open("wb") as output:
            shutil.copyfileobj(response, output, length=1024 * 1024)
        if not valid_file(partial, size, digest):
            raise RuntimeError("O download não passou na verificação SHA256: " + name)
        partial.replace(target)
        print(name + ": download íntegro.", flush=True)

def configure() -> None:
    path = APP_ROOT / ".env.kokoro.local"
    if not path.exists():
        with path.open("x", encoding="utf-8") as output:
            output.write("# Configuração local privada. Não versionar.\nTTS_PROVIDER=kokoro\nKOKORO_URL=http://127.0.0.1:8765\nKOKORO_API_TOKEN=" + secrets.token_urlsafe(32) + "\n")
        print("Configuração privada da voz local criada.", flush=True)

def main() -> None:
    if not PYTHON.is_file():
        subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)
    requirements = SERVICE_ROOT / "requirements.txt"
    uv = shutil.which("uv")
    if uv:
        install = [uv, "pip", "install", "--python", str(PYTHON), "--link-mode=copy", "-r", str(requirements)]
    else:
        subprocess.run([str(PYTHON), "-m", "ensurepip"], check=True)
        install = [str(PYTHON), "-m", "pip", "install", "-r", str(requirements)]
    subprocess.run(install, check=True)
    download_models()
    configure()
    print("Dora pronta. Execute npm run start:kokoro depois de npm run build.", flush=True)

if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print("Não foi possível preparar a Dora: " + str(error), file=sys.stderr)
        sys.exit(1)
