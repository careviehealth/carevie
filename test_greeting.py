from llm import get_reply

# Test greetings and language mixing
test_inputs = ["Hi", "Hi!", "Hi.", "Hello", "Hello!", "नमस्ते", "नमस्ते!", "मैं अपॉइंटमेंट कैसे बुक करूं?"]

for inp in test_inputs:
    reply = get_reply(inp)
    print(f"Input: '{inp}' -> Reply: '{reply}'")
