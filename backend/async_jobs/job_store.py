from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Condition, Lock
from typing import Any
from uuid import uuid4


UTC = timezone.utc
TERMINAL_STATUSES = {"completed", "failed"}


@dataclass
class JobConfig:
    ttl_seconds: int = 60 * 30
    max_runtime_seconds: int = 60


class InMemoryJobStore:
    def __init__(self, config: JobConfig | None = None):
        self.config = config or JobConfig()
        self._jobs: dict[str, dict[str, Any]] = {}
        self._lock = Lock()
        self._cond = Condition(self._lock)
        self._version = 0

    def create_chat_job(self, message: str, profile_id: str | None) -> dict[str, Any]:
        return self.create_job(
            job_type="chat",
            profile_id=profile_id,
            message=message,
        )

    def create_job(
        self,
        *,
        job_type: str,
        profile_id: str | None = None,
        message: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        job_id = str(uuid4())
        with self._cond:
            self._cleanup_expired_locked(now)
            job = {
                "job_id": job_id,
                "type": job_type,
                "status": "queued",
                "stage": "queued",
                "created_at": now.isoformat(),
                "started_at": None,
                "completed_at": None,
                "expires_at": (now + timedelta(seconds=self.config.ttl_seconds)).isoformat(),
                "max_runtime_seconds": self.config.max_runtime_seconds,
                "runtime_exceeded": False,
                "message": message,
                "profile_id": profile_id,
                "metadata": metadata or {},
                "result": None,
                "error": None,
                "_v": self._version + 1,
            }
            self._version += 1
            self._jobs[job_id] = job
            self._cond.notify_all()
            return self._public(job)

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        now = datetime.now(UTC)
        with self._lock:
            self._cleanup_expired_locked(now)
            job = self._jobs.get(job_id)
            return self._public(job) if job else None

    def wait_for_update(self, job_id: str, timeout_seconds: float) -> dict[str, Any] | None:
        deadline = datetime.now(UTC) + timedelta(seconds=max(0.0, timeout_seconds))
        with self._cond:
            current = self._jobs.get(job_id)
            seen_v = current.get("_v", 0) if current else 0
            while True:
                now = datetime.now(UTC)
                self._cleanup_expired_locked(now)
                job = self._jobs.get(job_id)
                if job is None:
                    return None
                if job.get("_v", 0) != seen_v:
                    return self._public(job)
                remaining = (deadline - now).total_seconds()
                if remaining <= 0:
                    return self._public(job)
                self._cond.wait(timeout=remaining)

    def mark_running(self, job_id: str) -> None:
        now = datetime.now(UTC)
        with self._cond:
            self._cleanup_expired_locked(now)
            job = self._jobs.get(job_id)
            if not job or job["status"] in TERMINAL_STATUSES:
                return
            job["status"] = "running"
            job["stage"] = "running"
            job["started_at"] = now.isoformat()
            self._bump(job)

    def guard_runtime(self, job_id: str) -> bool:
        now = datetime.now(UTC)
        with self._cond:
            job = self._jobs.get(job_id)
            if not job or job["status"] in TERMINAL_STATUSES:
                return False
            started_at = job.get("started_at")
            if not started_at:
                return False
            started = datetime.fromisoformat(started_at)
            runtime = (now - started).total_seconds()
            max_runtime = float(job.get("max_runtime_seconds") or 0)
            if runtime > max_runtime > 0:
                job["status"] = "failed"
                job["stage"] = "failed"
                job["runtime_exceeded"] = True
                job["error"] = "Unable to process request."
                job["completed_at"] = now.isoformat()
                self._bump(job)
                return True
            return False

    def mark_completed(self, job_id: str, result: dict[str, Any]) -> None:
        now = datetime.now(UTC)
        with self._cond:
            self._cleanup_expired_locked(now)
            job = self._jobs.get(job_id)
            if not job or job["status"] in TERMINAL_STATUSES:
                return
            job["status"] = "completed"
            job["stage"] = "completed"
            job["result"] = result
            job["completed_at"] = now.isoformat()
            self._bump(job)

    def mark_failed(self, job_id: str, error: str = "Unable to process request.") -> None:
        now = datetime.now(UTC)
        with self._cond:
            self._cleanup_expired_locked(now)
            job = self._jobs.get(job_id)
            if not job or job["status"] in TERMINAL_STATUSES:
                return
            job["status"] = "failed"
            job["stage"] = "failed"
            job["error"] = error
            job["completed_at"] = now.isoformat()
            self._bump(job)

    def cleanup_expired(self) -> None:
        with self._cond:
            self._cleanup_expired_locked(datetime.now(UTC))

    def _bump(self, job: dict[str, Any]) -> None:
        self._version += 1
        job["_v"] = self._version
        self._cond.notify_all()

    def _cleanup_expired_locked(self, now: datetime) -> None:
        expired = []
        for job_id, job in self._jobs.items():
            expires_at = job.get("expires_at")
            if not expires_at:
                continue
            expires = datetime.fromisoformat(expires_at)
            if expires <= now:
                expired.append(job_id)
        for job_id in expired:
            self._jobs.pop(job_id, None)
        if expired:
            self._cond.notify_all()

    @staticmethod
    def _public(job: dict[str, Any] | None) -> dict[str, Any] | None:
        if not job:
            return None
        clean = dict(job)
        clean.pop("_v", None)
        return clean


job_store = InMemoryJobStore()
