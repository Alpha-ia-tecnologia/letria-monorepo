"""Private, bounded storage for explicitly prepared catalogue narration only."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import threading

from synthesis import MAX_AUDIO, checked_wav


def audio_key(identity: object, text: str, profile: str, pace: str) -> str:
    encoded = json.dumps([identity, profile, pace, text], ensure_ascii=False, sort_keys=True,
                         separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class AudioStore:
    """No plaintext index, transcripts or request identifiers are persisted.

    Completed WAVs are atomically replaced. A changed model/reference identity
    produces different keys; an incomplete or invalid file is never a cache hit.
    The directory belongs to the private Python service, outside public assets.
    """
    def __init__(self, directory: Path, max_bytes: int = 256 * 1024 * 1024, max_items: int = 2048):
        if max_bytes <= 0 or max_items <= 0:
            raise ValueError("Invalid audio storage limits")
        self.directory = directory.resolve()
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.max_bytes, self.max_items = max_bytes, max_items
        self.lock = threading.Lock()
        with self.lock:
            self._prune()

    def _path(self, key: str) -> Path:
        if not isinstance(key, str) or not re.fullmatch(r"[0-9a-f]{64}", key):
            raise ValueError("Invalid audio storage key")
        return self.directory / (key + ".wav")

    def _prune(self) -> None:
        entries = []
        for path in self.directory.glob("*.wav"):
            if path.is_symlink() or not re.fullmatch(r"[0-9a-f]{64}\.wav", path.name):
                continue
            try:
                info = path.stat()
                entries.append((info.st_mtime_ns, path.name, info.st_size, path))
            except FileNotFoundError:
                continue
        entries.sort()
        size, count = sum(item[2] for item in entries), len(entries)
        for _, _, length, path in entries:
            if size <= self.max_bytes and count <= self.max_items:
                break
            path.unlink(missing_ok=True)
            size -= length
            count -= 1

    def get(self, key: str) -> bytes | None:
        path = self._path(key)
        with self.lock:
            if path.is_symlink() or not path.is_file():
                return None
            try:
                if path.stat().st_size > MAX_AUDIO:
                    raise ValueError("Audio limit exceeded")
                data = checked_wav(path.read_bytes())
                os.utime(path, None)
                return data
            except (OSError, ValueError):
                path.unlink(missing_ok=True)
                return None

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        checked_wav(data)
        if len(data) > self.max_bytes:
            raise ValueError("Audio exceeds storage capacity")
        with self.lock:
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(prefix=".audio-", suffix=".tmp", dir=self.directory, delete=False) as output:
                    temporary = Path(output.name)
                    output.write(data)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temporary, path)
                self._prune()
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)
