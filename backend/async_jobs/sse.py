"""
SSE helpers for async chat jobs.

This module is intentionally tolerant to minor job_store API differences so it
can integrate with Agent 1's implementation without tight coupling.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, Generator, Optional

try:
    from .job_store import job_store
except Exception:  # pragma: no cover - temporary until Agent 1 lands job_store
    job_store = None

logger = logging.getLogger(__name__)

TERMINAL_STATUSES = {"completed", "failed", "cancelled", "expired"}


def _sse_event(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=True)}\n\n"


def _heartbeat() -> str:
    return ": keepalive\n\n"


def _get_job_snapshot(job_id: str) -> Optional[Dict[str, Any]]:
    if job_store is None:
        return None
    # Preferred API surface from shared job store.
    if hasattr(job_store, "get_job"):
        return job_store.get_job(job_id)
    if hasattr(job_store, "get"):
        return job_store.get(job_id)
    return None


def _wait_for_update(job_id: str, timeout_seconds: float) -> Optional[Dict[str, Any]]:
    if job_store is None:
        return None
    # Optional blocking API if Agent 1 provides it.
    if hasattr(job_store, "wait_for_update"):
        return job_store.wait_for_update(job_id, timeout_seconds)
    if hasattr(job_store, "wait"):
        return job_store.wait(job_id, timeout_seconds)
    return None


def _normalize_status(status: Any) -> str:
    if not status:
        return "processing"
    text = str(status).strip().lower()
    if text in {"queued", "running", "processing", "retrying"}:
        return "processing"
    if text == "completed":
        return "completed"
    if text in {"failed", "cancelled", "expired"}:
        return "failed"
    return "processing"


def stream_chat_job_events(
    job_id: str,
    *,
    heartbeat_seconds: float = 15.0,
    poll_seconds: float = 0.5,
    max_stream_seconds: float = 1800.0,
) -> Generator[str, None, None]:
    """
    Stream SSE events for a single async chat job.

    Emitted schema:
      accepted  {job_id, status}
      progress  {job_id, stage, message?}
      completed {job_id, result}
      failed    {job_id, error}
    """
    started_at = time.monotonic()
    last_heartbeat = started_at
    last_sig: Optional[tuple] = None
    accepted_sent = False

    while True:
        now = time.monotonic()
        if now - started_at > max_stream_seconds:
            yield _sse_event("failed", {"job_id": job_id, "error": "Unable to process request."})
            return

        if job_store is None:
            yield _sse_event("failed", {"job_id": job_id, "error": "Unable to process request."})
            return

        job = _wait_for_update(job_id, timeout_seconds=poll_seconds)
        if job is None:
            job = _get_job_snapshot(job_id)

        if not accepted_sent:
            if job is None:
                yield _sse_event("failed", {"job_id": job_id, "error": "Unable to process request."})
                return
            yield _sse_event("accepted", {"job_id": job_id, "status": "processing"})
            accepted_sent = True

        if job is not None:
            raw_status = str(job.get("status", "processing")).lower()
            status = _normalize_status(raw_status)
            stage = job.get("stage") or raw_status or "processing"
            message = job.get("message")
            result = job.get("result")
            error = job.get("error")

            sig = (status, stage, message, bool(result), error)
            if sig != last_sig and status == "processing":
                payload: Dict[str, Any] = {"job_id": job_id, "stage": stage}
                if isinstance(message, str) and message.strip():
                    payload["message"] = message.strip()
                yield _sse_event("progress", payload)
                last_sig = sig

            if raw_status in TERMINAL_STATUSES or status in {"completed", "failed"}:
                if status == "completed":
                    yield _sse_event("completed", {"job_id": job_id, "result": result})
                else:
                    err_msg = error if isinstance(error, str) and error.strip() else "Unable to process request."
                    yield _sse_event("failed", {"job_id": job_id, "error": err_msg})
                return

        if now - last_heartbeat >= heartbeat_seconds:
            yield _heartbeat()
            last_heartbeat = now

        if not hasattr(job_store, "wait_for_update") and not hasattr(job_store, "wait"):
            time.sleep(poll_seconds)
