"""
app.py
======
Flask backend for the CareVie chatbot assistant.

SECURITY MODEL
──────────────────────────────────────────────────────────────────────────────
profile_id is expected to arrive from the Next.js proxy already resolved to
the server-session-verified value (or null for unauthenticated users).

As a defense-in-depth measure, this layer independently validates the format
of profile_id before it reaches intent_detector.py. This guards against:
  • Misconfigured Next.js proxy accidentally forwarding client values
  • Direct API calls that bypass the Next.js layer
  • Injection attacks via malformed ID strings

Public intents (greeting, unknown, platform_related) work without any
profile_id. Protected intents are gated inside intent_detector.py.
"""

from dotenv import load_dotenv
import os
import re

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
from intent_detector import detect_intent
from internal_auth import authorize_internal_request

app = Flask(__name__)

PROTECTED_API_PATHS = {"/api/chat"}

CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://vytara-ssr.vercel.app",
            "https://*.vercel.app",
            "https://*.ngrok.io",
            "https://ophthalmoscopic-starchlike-yuk.ngrok-free.dev"
        ],
        "methods": ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})

# ---------------------------------------------------------------------------
# profile_id Validation
# ---------------------------------------------------------------------------

# Supabase auth UIDs are standard UUID v4 strings.
# Adjust this pattern if your profile IDs use a different format.
_PROFILE_ID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE
)


def sanitize_profile_id(raw_id) -> str | None:
    """
    Validate and sanitise an incoming profile_id value.

    Accepts only non-empty strings that match the expected UUID v4 format.
    Returns the validated string on success, or None if validation fails.

    This is a defense-in-depth guard — the primary source of truth for
    identity is the Next.js session; this function catches anything that
    slips through due to misconfiguration or direct API access.

    Parameters
    ----------
    raw_id : any
        The raw value from the request payload.

    Returns
    -------
    str | None
        Validated profile_id string, or None.
    """
    if raw_id is None:
        return None

    if not isinstance(raw_id, str):
        app.logger.warning(
            "[sanitize_profile_id] Non-string profile_id received (type=%s) — rejecting.",
            type(raw_id).__name__,
        )
        return None

    pid = raw_id.strip()

    if not pid:
        return None

    if not _PROFILE_ID_PATTERN.match(pid):
        app.logger.warning(
            "[sanitize_profile_id] profile_id failed format validation — rejecting. "
            "Value (truncated): %.40s", pid
        )
        return None

    return pid


# ---------------------------------------------------------------------------
# Internal Auth Middleware
# ---------------------------------------------------------------------------

@app.before_request
def require_internal_api_auth():
    if request.method == "OPTIONS":
        return None

    if request.path not in PROTECTED_API_PATHS:
        return None

    return authorize_internal_request()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route('/api/tunnel-url', methods=['GET'])
def get_tunnel_url():
    """Returns the ngrok tunnel URL from the ngrok API."""
    try:
        response = requests.get('http://localhost:4040/api/tunnels')
        data = response.json()
        if data.get('tunnels') and len(data['tunnels']) > 0:
            tunnel_url = data['tunnels'][0]['public_url']
            return jsonify({'tunnel_url': tunnel_url}), 200
        return jsonify({'tunnel_url': None, 'message': 'No active tunnels'}), 200
    except Exception as e:
        return jsonify({'tunnel_url': None, 'message': 'ngrok not running or API unavailable'}), 200


@app.route('/api/chat', methods=['POST'])
def chat():
    """
    Main chat endpoint.

    Expects JSON body:
        {
            "message":    str,          # required — the user's query
            "profile_id": str | null    # injected by Next.js from server session;
                                        # null for unauthenticated/guest users
        }

    profile_id is validated server-side regardless of what the client sends.
    Public intents (greeting, unknown, platform_related) work with null.
    Protected intents return a login prompt when profile_id is null.
    """
    try:
        data = request.get_json(silent=True)

        if not data or not isinstance(data, dict):
            return jsonify({'success': False, 'reply': 'Invalid or missing JSON body.'}), 400

        if 'message' not in data:
            return jsonify({'success': False, 'reply': 'No message provided.'}), 400

        message = data.get('message', '')

        if not isinstance(message, str) or not message.strip():
            return jsonify({'success': False, 'reply': 'Message must be a non-empty string.'}), 400

        # ── SECURITY: Validate profile_id format (defense-in-depth) ─────────
        # The Next.js layer is the primary trust boundary; this is a backstop.
        # An invalid format (e.g. SQL injection, path traversal, arbitrary string)
        # is treated the same as no profile_id — the user gets a login prompt
        # for protected intents rather than an error that reveals system internals.
        raw_profile_id = data.get('profile_id')
        profile_id = sanitize_profile_id(raw_profile_id)

        if raw_profile_id is not None and profile_id is None:
            # Log the rejection for security audit trail but do NOT surface the
            # invalid value in the response to avoid information leakage.
            app.logger.warning(
                "[/api/chat] profile_id failed validation and was nullified. "
                "This may indicate a misconfigured proxy or an attempted injection."
            )
            # Fall through with profile_id = None — intent_detector will
            # respond with a login prompt for any protected intent.

        result = detect_intent(message=message.strip(), profile_id=profile_id)

        if not isinstance(result, dict):
            return jsonify({
                'success': False,
                'reply': 'Assistant returned an invalid response format.'
            }), 500

        success = bool(result.get('success', False))
        reply = result.get('message')

        if not isinstance(reply, str) or not reply.strip():
            reply = 'Unable to process request.'

        return jsonify({'success': success, 'reply': reply}), 200

    except Exception as e:
        app.logger.error("[/api/chat] Unhandled exception: %s", e, exc_info=True)
        return jsonify({'success': False, 'reply': 'Unable to process request.'}), 500


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)