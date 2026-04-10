import re

def detect_language(text):
    """Simple heuristic-based language detection for Hindi vs English."""
    
    # Devanagari script detection
    devanagari_count = len(re.findall(r"[\u0900-\u097F]", text))
    if devanagari_count > 0:
        if len(text) > 0 and (devanagari_count / len(text)) > 0.1:
            return "hi"
    
    text_lower = text.lower()
    
    strong_hindi_words = [
        r"\bhai\b", r"\bka\b", r"\bki\b", r"\bke\b", r"\bko\b",
        r"\bse\b", r"\bne\b", r"\bho\b", r"\btha\b", r"\bthi\b",
        r"\bnahim\b", r"\bnahi\b", r"\bkya\b", r"\bme\b", r"\bpar\b"
    ]
    
    strong_english_words = [
        r"\bthe\b", r"\bis\b", r"\bare\b", r"\bam\b", r"\bwas\b",
        r"\bwere\b", r"\bwill\b", r"\bwould\b", r"\bcan\b", r"\bcould\b",
        r"\bshould\b", r"\bhave\b", r"\bhas\b", r"\bhad\b", r"\bmy\b",
        r"\byour\b", r"\btheir\b", r"\bour\b", r"\bthis\b", r"\bthat\b",
        r"\bthese\b", r"\bthose\b", r"\bwhat\b", r"\bhow\b", r"\bwhen\b"
    ]
    
    hindi_count = 0
    english_count = 0
    
    for pattern in strong_hindi_words:
        if re.search(pattern, text_lower):
            hindi_count += 1
    
    for pattern in strong_english_words:
        if re.search(pattern, text_lower):
            english_count += 1
    
    if english_count > hindi_count:
        return "en"
    if hindi_count >= 2:
        return "hi"
    if hindi_count >= 1 and english_count == 0:
        return "hi"
    
    return "en"

if __name__ == "__main__":
    test_cases = [
        ("namaste, how are you?", "en"),
        ("mujhe samajh nahi aata kya", "hi"),
        ("I am fine, thanks for asking", "en"),
        ("यह एक हिंदी वाक्य है", "hi"),
        ("kai ka matlab kya hai?", "en"),
        ("what is your name?", "en"),
        ("mera naam raj hai", "hi"),
    ]
    
    for text, expected in test_cases:
        result = detect_language(text)
        print(f"Text: '{text}' -> Result: {result} (Expected: {expected})")