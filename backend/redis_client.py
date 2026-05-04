import os
from threading import Lock
import time

_CLIENT = None
_LAST_ATTEMPT_TS = 0.0
_RETRY_BACKOFF_SECONDS = 5.0
_LOCK = Lock()


def get_redis_client():
    """Return a cached Redis client configured from REDIS_URL, or None."""
    global _CLIENT
    global _LAST_ATTEMPT_TS

    redis_url = (os.getenv("REDIS_URL") or "").strip()
    if not redis_url:
        return None

    with _LOCK:
        if _CLIENT is not None:
            return _CLIENT

        now = time.time()
        if now - _LAST_ATTEMPT_TS < _RETRY_BACKOFF_SECONDS:
            return None
        _LAST_ATTEMPT_TS = now

        try:
            import redis

            client = redis.Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
                retry_on_timeout=True,
            )
            client.ping()
            _CLIENT = client
            return _CLIENT
        except Exception:
            _CLIENT = None
            return None
