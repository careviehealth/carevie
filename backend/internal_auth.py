import hmac
import os
from flask import jsonify, request

INTERNAL_API_KEY_HEADER = "x-vytara-internal-key"
DEFAULT_DEV_INTERNAL_API_KEY = "vytara-local-dev-internal-key"

def is_production_environment() -> bool:
    """Check for common production environment markers."""
    return (
        os.getenv("NODE_ENV") == "production"
        or os.getenv("ENV") == "production"
        or os.getenv("ENVIRONMENT") == "production"
        or os.getenv("RENDER") == "true"
    )

def get_expected_internal_api_key():
    """Retrieve the API key from environment or fallback to dev key."""
    configured_key = (os.getenv("BACKEND_INTERNAL_API_KEY") or "").strip()
    if configured_key:
        return configured_key

    if is_production_environment():
        return None

    return DEFAULT_DEV_INTERNAL_API_KEY

def authorize_internal_request():
    """Flask-friendly middleware to validate internal headers."""
    expected_key = get_expected_internal_api_key()
    if not expected_key:
        print("❌ BACKEND_INTERNAL_API_KEY is missing in a production environment", flush=True)
        return jsonify({
            "success": False,
            "error": "Internal API authentication is not configured",
        }), 500

    provided_key = (request.headers.get(INTERNAL_API_KEY_HEADER) or "").strip()
    if not provided_key or not hmac.compare_digest(provided_key, expected_key):
        return jsonify({
            "success": False,
            "error": "Unauthorized",
        }), 401

    return None