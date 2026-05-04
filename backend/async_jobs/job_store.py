from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import os
import time
from threading import Condition, Lock
from typing import Any
from uuid import uuid4


UTC = timezone.utc
TERMINAL_STATUSES = {"completed", "failed"}
REDIS_KEY_PREFIX = "async_job:"


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


class RedisJobStore:
    def __init__(self, redis_client: Any, config: JobConfig | None = None):
        self.config = config or JobConfig()
        self._redis = redis_client

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
            "_v": 1,
        }
        self._set_job(job_id, job)
        return self._public(job)

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        job = self._get_job(job_id)
        return self._public(job)

    def wait_for_update(self, job_id: str, timeout_seconds: float) -> dict[str, Any] | None:
        current = self._get_job(job_id)
        if current is None:
            return None
        seen_v = int(current.get("_v", 0) or 0)

        timeout = max(0.0, float(timeout_seconds))
        if timeout == 0:
            return self._public(current)

        deadline = time.monotonic() + timeout
        sleep_seconds = 0.1

        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return self._public(self._get_job(job_id))

            time.sleep(min(sleep_seconds, remaining))
            job = self._get_job(job_id)
            if job is None:
                return None
            if int(job.get("_v", 0) or 0) != seen_v:
                return self._public(job)

    def mark_running(self, job_id: str) -> None:
        def mutate(job: dict[str, Any], now: datetime) -> bool:
            if job["status"] in TERMINAL_STATUSES:
                return False
            job["status"] = "running"
            job["stage"] = "running"
            job["started_at"] = now.isoformat()
            return True

        self._update_job(job_id, mutate)

    def guard_runtime(self, job_id: str) -> bool:
        exceeded = False

        def mutate(job: dict[str, Any], now: datetime) -> bool:
            nonlocal exceeded
            if job["status"] in TERMINAL_STATUSES:
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
                exceeded = True
                return True
            return False

        self._update_job(job_id, mutate)
        return exceeded

    def mark_completed(self, job_id: str, result: dict[str, Any]) -> None:
        def mutate(job: dict[str, Any], now: datetime) -> bool:
            if job["status"] in TERMINAL_STATUSES:
                return False
            job["status"] = "completed"
            job["stage"] = "completed"
            job["result"] = result
            job["completed_at"] = now.isoformat()
            return True

        self._update_job(job_id, mutate)

    def mark_failed(self, job_id: str, error: str = "Unable to process request.") -> None:
        def mutate(job: dict[str, Any], now: datetime) -> bool:
            if job["status"] in TERMINAL_STATUSES:
                return False
            job["status"] = "failed"
            job["stage"] = "failed"
            job["error"] = error
            job["completed_at"] = now.isoformat()
            return True

        self._update_job(job_id, mutate)

    def cleanup_expired(self) -> None:
        # Redis key expiration is authoritative; no sweep needed.
        return None

    def _key(self, job_id: str) -> str:
        return f"{REDIS_KEY_PREFIX}{job_id}"

    def _get_job(self, job_id: str) -> dict[str, Any] | None:
        raw = self._redis.get(self._key(job_id))
        if raw is None:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        try:
            return json.loads(raw)
        except Exception:
            return None

    def _set_job(self, job_id: str, job: dict[str, Any]) -> None:
        payload = json.dumps(job, ensure_ascii=True, separators=(",", ":"))
        ttl = self._ttl_from_job(job)
        if ttl <= 0:
            ttl = 1
        self._redis.set(self._key(job_id), payload, ex=ttl)

    def _update_job(self, job_id: str, mutate: Any) -> None:
        now = datetime.now(UTC)
        for _ in range(3):
            key = self._key(job_id)
            with self._redis.pipeline() as pipe:
                try:
                    pipe.watch(key)
                    raw = pipe.get(key)
                    if raw is None:
                        pipe.unwatch()
                        return
                    if isinstance(raw, bytes):
                        raw = raw.decode("utf-8")
                    job = json.loads(raw)
                    if not isinstance(job, dict):
                        pipe.unwatch()
                        return

                    if not mutate(job, now):
                        pipe.unwatch()
                        return

                    job["_v"] = int(job.get("_v", 0) or 0) + 1
                    payload = json.dumps(job, ensure_ascii=True, separators=(",", ":"))
                    ttl = self._ttl_from_job(job)
                    if ttl <= 0:
                        pipe.unwatch()
                        return
                    pipe.multi()
                    pipe.set(key, payload, ex=ttl)
                    pipe.execute()
                    return
                except Exception:
                    # WatchError or transient decode/connection issues.
                    continue

    def _ttl_from_job(self, job: dict[str, Any]) -> int:
        expires_at = job.get("expires_at")
        if isinstance(expires_at, str):
            try:
                exp = datetime.fromisoformat(expires_at)
                return int(max(0.0, (exp - datetime.now(UTC)).total_seconds()))
            except Exception:
                pass
        return int(self.config.ttl_seconds)

    @staticmethod
    def _public(job: dict[str, Any] | None) -> dict[str, Any] | None:
        if not job:
            return None
        clean = dict(job)
        clean.pop("_v", None)
        return clean


def _build_job_store() -> InMemoryJobStore | RedisJobStore:
    config = JobConfig()
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        return InMemoryJobStore(config=config)

    try:
        import redis  # type: ignore

        client = redis.Redis.from_url(redis_url, decode_responses=False)
        client.ping()
        return RedisJobStore(client, config=config)
    except Exception:
        return InMemoryJobStore(config=config)


job_store = _build_job_store()
