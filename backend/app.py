from dotenv import load_dotenv
import os

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

@app.before_request
def require_internal_api_auth():
    if request.method == "OPTIONS":
        return None

    if request.path not in PROTECTED_API_PATHS:
        return None

    return authorize_internal_request()

@app.route('/api/tunnel-url', methods=['GET'])
def get_tunnel_url():
    """Returns the ngrok tunnel URL from the ngrok API"""
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
    try:
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({'success': False, 'reply': 'No message provided'}), 400

        message = data.get('message', '')
        profile_id = data.get('profile_id')
        result = detect_intent(message=message, profile_id=profile_id)

        if not isinstance(result, dict):
            return jsonify({
                'success': False,
                'reply': 'Assistant returned an invalid response format'
            }), 500

        success = bool(result.get('success', False))
        reply = result.get('message')
        if not isinstance(reply, str) or not reply.strip():
            reply = 'Unable to process request'

        return jsonify({'success': success, 'reply': reply}), 200
    except Exception as e:
        print(f"Error in chat endpoint: {e}")
        return jsonify({'success': False, 'reply': 'Unable to process request'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
