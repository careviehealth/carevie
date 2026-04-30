import math
from datetime import datetime
from threading import Lock

from redis_client import get_redis_client

_mem_lock = Lock()
_mem_rate = {}


def _now_ts() -> int:
    return int(datetime.utcnow().timestamp())


def check_rate_limit(key: str, identifier: str, limit: int, window_seconds: int):
    """Fixed-window rate limit check.

    Returns: (allowed, retry_after_seconds, remaining)
    """
    safe_id = (identifier or "anon").strip() or "anon"
    rate_key = f"carevie:rl:{key}:{safe_id}"

    client = get_redis_client()
    if client:
        try:
            pipe = client.pipeline()
            pipe.incr(rate_key)
            pipe.ttl(rate_key)
            count, ttl = pipe.execute()

            if int(count) == 1:
                client.expire(rate_key, int(window_seconds))
                ttl = int(window_seconds)
            elif ttl is None or int(ttl) < 0:
                client.expire(rate_key, int(window_seconds))
                ttl = int(window_seconds)

            allowed = int(count) <= int(limit)
            retry_after = max(int(ttl), 1)
            remaining = max(int(limit) - int(count), 0)
            return allowed, retry_after, remaining
        except Exception:
            pass

    now = _now_ts()
    with _mem_lock:
        entry = _mem_rate.get(rate_key)
        if not entry or now >= int(entry.get("reset_at", 0)):
            reset_at = now + int(window_seconds)
            _mem_rate[rate_key] = {"count": 1, "reset_at": reset_at}
            return True, int(window_seconds), max(int(limit) - 1, 0)

        entry["count"] = int(entry.get("count", 0)) + 1
        retry_after = max(int(entry["reset_at"]) - now, 1)
        allowed = int(entry["count"]) <= int(limit)
        remaining = max(int(limit) - int(entry["count"]), 0)
        return allowed, retry_after, remaining
