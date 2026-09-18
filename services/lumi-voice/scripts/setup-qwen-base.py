"""Install the pinned Qwen Base model, reusing verified local tokenizer files.

This does not change private provider configuration or start services. The
reference must be Lumi's original synthetic audio. Use its exact transcript
when available, or explicitly select speaker-embedding mode without a transcript.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys

SERVICE_ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("qwen_setup", SERVICE_ROOT / "scripts/setup-qwen.py")
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)
ROOT = setup.ROOT
SOURCE_MODELS = setup.MODELS
MODELS = SERVICE_ROOT / "models/base"
MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
REVISION = "fd4b254389122332181a7c3db7f27e918eec64e3"
ASSETS = dict(setup.ASSETS)
ASSETS["model.safetensors"] = (3857413744, "38fc7fc51c5e776e840414b6fd443962e9411b9654888fd7913e4da643cb857c")
ASSETS["config.json"] = (4494, "b4f01752d15a488abde3e1ab44723ae4f4b9e68a4037257b098b3737893cc1f9")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Only verify installed files")
    parser.add_argument("--reference-wav", type=Path)
    reference_mode = parser.add_mutually_exclusive_group()
    reference_mode.add_argument("--reference-text-file", type=Path)
    reference_mode.add_argument("--reference-embedding-only", action="store_true", help="Reuse the original synthetic speaker embedding without an unverified transcript")
    args = parser.parse_args()
    if bool(args.reference_wav) != bool(args.reference_text_file or args.reference_embedding_only):
        parser.error("Provide the original synthetic WAV and either an exact transcript or --reference-embedding-only")
    if not setup.PYTHON.is_file():
        raise SystemExit("Install the isolated Qwen runtime with setup-qwen.py from this scripts directory first")
    if args.check:
        missing = [name for name, (size, digest) in ASSETS.items() if not setup.verified(MODELS / name, size, digest)]
        if missing:
            raise SystemExit("Unverified Base files: " + ", ".join(missing))
        print("All Qwen Base files passed SHA256 verification.")
        return
    missing_size = sum(size for name, (size, _) in ASSETS.items() if not (MODELS / name).exists())
    if shutil.disk_usage(ROOT).free < missing_size + 1024**3:
        raise SystemExit("Reserve enough disk space for Qwen Base and one GB of temporary space")
    MODELS.mkdir(parents=True, exist_ok=True)
    setup.MODELS = MODELS
    setup.BASE = "https://huggingface.co/" + MODEL + "/resolve/" + REVISION + "/"
    def install(item):
        name, (size, digest) = item
        target, source = MODELS / name, SOURCE_MODELS / name
        if not setup.verified(target, size, digest) and setup.verified(source, size, digest):
            target.parent.mkdir(parents=True, exist_ok=True)
            partial = target.with_name(target.name + ".part")
            shutil.copyfile(source, partial)
            if not setup.verified(partial, size, digest):
                raise RuntimeError("Local model copy failed verification")
            partial.replace(target)
        setup.download(item)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(install, ASSETS.items()))
    (MODELS / ".verified.json").write_text(json.dumps({"model": MODEL, "revision": REVISION, "sha256": {name: value[1] for name, value in ASSETS.items()}}, indent=2), encoding="utf-8")
    if args.reference_wav:
        sys.path.insert(0, str(SERVICE_ROOT))
        from synthesis import checked_wav, validate_request
        data = checked_wav(args.reference_wav.read_bytes())
        text = None if args.reference_embedding_only else validate_request(args.reference_text_file.read_text(encoding="utf-8-sig"))[0]
        identity = hashlib.sha256(data).hexdigest()
        folder = SERVICE_ROOT / "voices/lumi"
        folder.mkdir(parents=True, exist_ok=True)
        destination = folder / "reference.wav"
        metadata = {"version": 1, "text": text, "sha256": identity, "provenance": "qwen-voice-design-original", "x_vector_only_mode": args.reference_embedding_only}
        if destination.exists() and hashlib.sha256(destination.read_bytes()).hexdigest() != identity:
            raise SystemExit("A different Lumi reference already exists; preserve it before choosing another voice")
        destination.write_bytes(data)
        (folder / "reference.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
        print("Lumi's original synthetic voice reference saved locally.")
    print("Qwen Base files verified. Provider configuration has not been changed.")


if __name__ == "__main__":
    main()
