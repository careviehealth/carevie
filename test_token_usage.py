import subprocess
import time
import requests

# Start the server
server = subprocess.Popen(['python', 'backend/app_api.py'], cwd='.')

# Wait for server to start
time.sleep(5)

# Make a test request
try:
    response = requests.post('http://localhost:5000/api/chat', json={'message': 'hello'})
    print("Response:", response.json())
except Exception as e:
    print("Error:", e)

# Stop the server
server.terminate()
server.wait()
