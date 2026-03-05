# backend/test_greeting.py

from llm import get_reply

# Test greetings
test_inputs = ["Hi", "Hi!", "Hi.", "Hello", "Hello!", "नमस्ते", "नमस्ते!"]

for inp in test_inputs:
    reply = get_reply(inp)
    print(f"Input: '{inp}' -> Reply: '{reply}'")
