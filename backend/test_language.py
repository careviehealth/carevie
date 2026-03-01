# backend/test_language.py

#!/usr/bin/env python3
"""
Test script for language detection function
"""

from language import detect_language

def test_detect_language():
    test_cases = [
        # English cases
        ("Hello, how are you?", "en"),
        ("I need help with my account", "en"),
        ("What is the pricing?", "en"),
        ("Login to the app", "en"),
        ("Doctor appointment", "en"),  # This should be en now, as "doctor" is removed
        ("Health records", "en"),     # Should be en

        # Hindi cases
        ("नमस्ते, आप कैसे हैं?", "hi"),
        ("मैं मदद चाहता हूँ", "hi"),
        ("मूल्य क्या है?", "hi"),
        ("ऐप में लॉगिन करें", "hi"),
        ("डॉक्टर अपॉइंटमेंट", "hi"),
        ("स्वास्थ्य रिकॉर्ड", "hi"),

        # Mixed/Edge cases
        ("Hello, क्या आप मदद कर सकते हैं?", "hi"),  # Mixed, but has Hindi
        ("I want to book an appointment क्या यह संभव है?", "hi"),  # Mixed with Hindi words
        ("Doctor, please help me", "en"),  # English with "doctor"
        ("", "en"),  # Empty string
        ("123", "en"),  # Numbers
        ("hai", "hi"),  # Single Hindi word, now requires 1
        ("ka ki", "hi"),  # Two Hindi words
        ("hai doctor", "hi"),  # hai + doctor (doctor is not in new list, but hai is)
        ("doctor treatment", "en"),  # English words
    ]

    print("Testing detect_language function:")
    print("=" * 50)

    passed = 0
    total = len(test_cases)

    for text, expected in test_cases:
        result = detect_language(text)
        status = "PASS" if result == expected else "FAIL"
        if status == "FAIL":
            print(f"[{status}] '{text}' -> {result} (expected {expected})")
        else:
            print(f"[{status}] '{text}' -> {result}")
            passed += 1

    print("=" * 50)
    print(f"Results: {passed}/{total} tests passed")

    if passed == total:
        print("All tests passed!")
    else:
        print(f"{total - passed} tests failed.")

if __name__ == "__main__":
    test_detect_language()
