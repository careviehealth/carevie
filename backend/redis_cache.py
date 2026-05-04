from datetime import datetime, timedelta, timezone
from threading import Lock

from redis_client import get_redis_client

TOKEN_TTL_SECONDS = 15 * 60
_KEY_PREFIX = "carevie:share"
EXPIRED_TOKEN_SENTINEL = "__EXPIRED__"

_mem_lock = Lock()
_mem_token_map = {}
_mem_profile_map = {}
_mem_issued_tokens = {}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _token_key(token: str) -> str:
    return f"{_KEY_PREFIX}:token:{token}"


def _profile_key(profile_id: str) -> str:
    return f"{_KEY_PREFIX}:profile:{profile_id}"


def _issued_key(token: str) -> str:
    return f"{_KEY_PREFIX}:issued:{token}"


def get_active_token_for_profile(profile_id: str):
    """Return (token, expires_at_iso) if active token exists for profile_id."""
    client = get_redis_client()

    if client:
        try:
            pkey = _profile_key(profile_id)
            token = client.get(pkey)
            if not token:
                return None

            token_profile = client.get(_token_key(token))
            if token_profile != str(profile_id):
                client.delete(pkey)
                return None

            ttl = client.ttl(_token_key(token))
            if ttl is None or ttl <= 0:
                client.delete(_token_key(token), pkey)
                return None

            expires_at = _now_utc() + timedelta(seconds=ttl)
            return token, expires_at.isoformat()
        except Exception:
            pass

    with _mem_lock:
        token = _mem_profile_map.get(str(profile_id))
        if not token:
            return None

        info = _mem_token_map.get(token)
        if not info:
            _mem_profile_map.pop(str(profile_id), None)
            return None

        expires_at = info.get("expires_at")
        if not expires_at or _now_utc() >= expires_at:
            _mem_token_map.pop(token, None)
            _mem_profile_map.pop(str(profile_id), None)
            return None

        return token, expires_at.isoformat()


def set_share_token(token: str, profile_id: str, ttl_seconds: int = TOKEN_TTL_SECONDS):
    """Store token->profile and profile->token with identical TTL."""
    client = get_redis_client()

    if client:
        try:
            tkey = _token_key(token)
            pkey = _profile_key(profile_id)
            pipe = client.pipeline()
            pipe.setex(tkey, int(ttl_seconds), str(profile_id))
            pipe.setex(pkey, int(ttl_seconds), str(token))
            pipe.setex(_issued_key(token), int(ttl_seconds) + 600, "1")
            pipe.execute()
            expires_at = _now_utc() + timedelta(seconds=int(ttl_seconds))
            return expires_at.isoformat()
        except Exception:
            pass

    with _mem_lock:
        expires_at = _now_utc() + timedelta(seconds=int(ttl_seconds))
        _mem_token_map[str(token)] = {
            "profile_id": str(profile_id),
            "expires_at": expires_at,
        }
        _mem_profile_map[str(profile_id)] = str(token)
        _mem_issued_tokens[str(token)] = expires_at + timedelta(minutes=10)
        return expires_at.isoformat()


def get_profile_id_by_token(token: str):
    """Return profile_id for active token; return None if missing/expired."""
    client = get_redis_client()

    if client:
        try:
            tkey = _token_key(token)
            profile_id = client.get(tkey)
            if not profile_id:
                if client.get(_issued_key(token)):
                    return EXPIRED_TOKEN_SENTINEL
                return None

            ttl = client.ttl(tkey)
            if ttl is None or ttl <= 0:
                client.delete(tkey)
                return None

            return str(profile_id)
        except Exception:
            pass

    with _mem_lock:
        info = _mem_token_map.get(str(token))
        if not info:
            issued_until = _mem_issued_tokens.get(str(token))
            if issued_until and _now_utc() <= issued_until:
                return EXPIRED_TOKEN_SENTINEL
            _mem_issued_tokens.pop(str(token), None)
            return None

        expires_at = info.get("expires_at")
        if not expires_at or _now_utc() >= expires_at:
            profile_id = info.get("profile_id")
            _mem_token_map.pop(str(token), None)
            if profile_id:
                _mem_profile_map.pop(str(profile_id), None)
            return EXPIRED_TOKEN_SENTINEL

        return str(info.get("profile_id"))
