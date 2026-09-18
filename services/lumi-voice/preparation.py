"""Bounded background preparation; interactive speech always has priority."""
from __future__ import annotations

from collections import OrderedDict, deque
import json
import os
from pathlib import Path
import re
import secrets
import tempfile
import threading

from synthesis import GENERATION_SECONDS, GenerationControl, SpeechCancelled, SpeechTimeout, checked_wav, validate_request

MAX_BATCH = 32
MAX_PENDING_ITEMS = 128
MAX_JOBS = 64
MAX_JOURNAL_BYTES = 2 * 1024 * 1024


class PreparationBusy(RuntimeError):
    pass


class PreparationUnavailable(RuntimeError):
    pass


class PreparationQueue:
    def __init__(self, server):
        self.server = server
        self.lock = threading.Condition()
        self.queue = deque()
        self.jobs = OrderedDict()
        self.preempt = threading.Event()
        self.active = False
        self.current = None
        self.journal_path = server.store.directory / "preparation.json"
        self.voice_identity = server.audio_key("", "reading", "natural")
        self._restore()
        self.thread = threading.Thread(target=self._run, name="lumi-catalogue-preparation", daemon=True)
        self.thread.start()

    def submit(self, items: object) -> dict:
        if not isinstance(items, list) or not 1 <= len(items) <= MAX_BATCH:
            raise ValueError("Invalid preparation batch")
        validated = []
        for item in items:
            if not isinstance(item, dict) or set(item) - {"input", "profile", "pace"}:
                raise ValueError("Invalid preparation item")
            value = validate_request(item.get("input"), item.get("profile", "reading"), item.get("pace", "natural"))
            if value not in validated:
                validated.append(value)
        with self.lock:
            if len(self.queue) + int(self.active) + len(validated) > MAX_PENDING_ITEMS:
                raise PreparationBusy()
            while len(self.jobs) >= MAX_JOBS:
                completed = next((key for key, job in self.jobs.items() if job["remaining"] == 0), None)
                if completed is None:
                    raise PreparationBusy()
                del self.jobs[completed]
            job_id = secrets.token_hex(16)
            self.jobs[job_id] = {"job_id": job_id, "status": "queued", "total": len(validated),
                                 "completed": 0, "failed": 0, "remaining": len(validated)}
            self.queue.extend((job_id, *value) for value in validated)
            try:
                self._persist()
            except (OSError, ValueError) as error:
                self.queue = deque(item for item in self.queue if item[0] != job_id)
                del self.jobs[job_id]
                raise PreparationUnavailable("Preparation could not be saved") from error
            self.lock.notify_all()
            return dict(self.jobs[job_id])

    def status(self, job_id: str) -> dict | None:
        with self.lock:
            value = self.jobs.get(job_id)
            return dict(value) if value else None

    def pending_count(self) -> int:
        with self.lock:
            return len(self.queue) + int(self.active)

    def close(self) -> None:
        self.preempt.set()
        with self.lock:
            self.lock.notify_all()
        # Native inference checks cancellation between generation steps. Do not
        # block HTTP shutdown indefinitely if a library fails to yield.
        self.thread.join(timeout=2)

    def _run(self) -> None:
        server = self.server
        while not server.stop_event.is_set():
            with self.lock:
                self.lock.wait_for(lambda: self.queue or server.stop_event.is_set())
                if server.stop_event.is_set():
                    return
                item = self.queue.popleft()
                job_id, text, profile, pace = item
                self.active = True
                self.current = item
                self.jobs[job_id]["status"] = "running"
            acquired = False
            outcome = "completed"
            try:
                key = server.audio_key(text, profile, pace)
                audio = server.cached(key)
                if audio is None:
                    # Never occupy the foreground FIFO. An arriving interactive
                    # request cancels this job and puts it back at the queue head.
                    with server.queue_condition:
                        while not server.stop_event.is_set():
                            if not server.pending and server.synthesis_lock.acquire(blocking=False):
                                acquired = True
                                self.preempt.clear()
                                break
                            server.queue_condition.wait(timeout=0.1)
                    control = GenerationControl(server.clock() + GENERATION_SECONDS,
                                                cancelled=lambda: self.preempt.is_set() or server.stop_event.is_set(),
                                                clock=server.clock)
                    control.check()
                    audio = server.cached(key)
                    if audio is None:
                        audio = checked_wav(server.synthesize(text, profile, pace, control))
                    control.check()
                server.store.put(key, audio)
                server.remember(key, audio)
            except SpeechTimeout:
                outcome = "failed"
            except SpeechCancelled:
                outcome = "retry"
            except Exception:
                # Neither voice text nor native model exceptions enter logs.
                outcome = "failed"
            finally:
                if acquired:
                    server.release_turn()
                with self.lock:
                    self.active = False
                    self.current = None
                    job = self.jobs[job_id]
                    if outcome == "retry":
                        self.queue.appendleft(item)
                        job["status"] = "queued"
                    else:
                        job["remaining"] -= 1
                        job["failed" if outcome != "completed" else "completed"] += 1
                        job["status"] = ("queued" if job["remaining"] else
                                         "ready" if not job["failed"] else
                                         "failed" if not job["completed"] else "partial")

                    try:
                        self._persist()
                    except (OSError, ValueError):
                        # The last atomic journal remains usable. Replaying a
                        # finished item after restart reuses its completed WAV.
                        pass

    def _persist(self) -> None:
        # Called with the condition held. Only explicitly submitted catalogue
        # text is journaled; normal conversation never enters this queue.
        items = ([self.current] if self.current is not None else []) + list(self.queue)
        payload = json.dumps({"version": 1, "voice_identity": self.voice_identity, "jobs": list(self.jobs.values()), "items": items},
                             ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        if len(payload) > MAX_JOURNAL_BYTES:
            raise ValueError("Preparation journal is too large")
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(prefix=".preparation-", suffix=".tmp", dir=self.server.store.directory, delete=False) as output:
                temporary = Path(output.name)
                output.write(payload)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.journal_path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    def _restore(self) -> None:
        if self.journal_path.is_symlink() or not self.journal_path.is_file():
            return
        try:
            if self.journal_path.stat().st_size > MAX_JOURNAL_BYTES:
                raise ValueError("Invalid preparation journal")
            data = json.loads(self.journal_path.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or data.get("version") != 1:
                raise ValueError("Invalid preparation journal")
            jobs, items = data.get("jobs"), data.get("items")
            if not isinstance(jobs, list) or len(jobs) > MAX_JOBS or not isinstance(items, list) or len(items) > MAX_PENDING_ITEMS:
                raise ValueError("Invalid preparation journal")
            restored_jobs = OrderedDict()
            for job in jobs:
                if not isinstance(job, dict) or not isinstance(job.get("job_id"), str) or not re.fullmatch(r"[0-9a-f]{32}", job["job_id"]):
                    raise ValueError("Invalid preparation job")
                if job["job_id"] in restored_jobs:
                    raise ValueError("Duplicate preparation job")
                counts = [job.get(field) for field in ("total", "completed", "failed", "remaining")]
                if any(type(value) is not int or not 0 <= value <= MAX_BATCH for value in counts) or counts[0] < 1 or sum(counts[1:]) != counts[0]:
                    raise ValueError("Invalid preparation counts")
                restored_jobs[job["job_id"]] = {"job_id": job["job_id"], "total": counts[0], "completed": counts[1],
                                               "failed": counts[2], "remaining": counts[3],
                                               "status": "queued" if counts[3] else "ready" if not counts[2] else "failed" if not counts[1] else "partial"}
            restored_items = []
            for item in items:
                if not isinstance(item, list) or len(item) != 4 or not isinstance(item[0], str) or item[0] not in restored_jobs:
                    raise ValueError("Invalid preparation item")
                restored_items.append((item[0], *validate_request(*item[1:])))
            for job_id, job in restored_jobs.items():
                if sum(item[0] == job_id for item in restored_items) != job["remaining"]:
                    raise ValueError("Invalid preparation queue count")
            if data.get("voice_identity") != self.voice_identity:
                # Previously completed audio belongs to a different voice/model.
                # Completed text is intentionally absent, so never claim it is
                # ready for this identity. Pending catalogue text can still run.
                for job_id, job in list(restored_jobs.items()):
                    if not job["remaining"]:
                        del restored_jobs[job_id]
                    else:
                        job["failed"] += job["completed"]
                        job["completed"] = 0
                        job["status"] = "queued"
            self.jobs = restored_jobs
            self.queue = deque(restored_items)
        except (OSError, ValueError, UnicodeError):
            # No unvalidated text or arbitrary paths can be restored. Completed
            # WAVs are independent and remain usable if the journal is damaged.
            self.jobs = OrderedDict()
            self.queue = deque()
