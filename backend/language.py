# backend/language.py

import re

def detect_language(text):
    """
    Improved language detection for Hindi vs English.
    Returns 'hi' for Hindi, 'en' for English.
    """
    
    # Check for Devanagari script (strongest indicator for Hindi)
    devanagari_count = len(re.findall(r"[\u0900-\u097F]", text))
    if devanagari_count > 0:
        # If more than 10% of text is Devanagari, it's Hindi
        if len(text) > 0 and (devanagari_count / len(text)) > 0.1:
            return "hi"
    
    text_lower = text.lower()
    
    # Strong Hindi indicators (word boundaries to avoid substring matches)
    strong_hindi_words = [
        r"\bhai\b",        # है (is)
        r"\bka\b",         # का (of/possessive)
        r"\bki\b",         # की (of/possessive feminine)
        r"\bke\b",         # के (of/possessive plural)
        r"\bko\b",         # को (to/object marker)
        r"\bse\b",         # से (from)
        r"\bne\b",         # ने (did - past tense marker)
        r"\bho\b",         # हो (be)
        r"\btha\b",        # था (was)
        r"\bthi\b",        # थी (was feminine)
        r"\bnahim\b",      # नहीं (no) - romanized
        r"\bhai\b",        # है (is)
        r"\bkya\b",        # क्या (what/is)
        r"\bkaun\b",       # कौन (who)
        r"\bkahan\b",      # कहाँ (where)
        r"\bkab\b",        # कब (when)
        r"\bkaise\b",      # कैसे (how)
        r"\bkyun\b",       # क्यों (why)
        r"\bacha\b",       # अच्छा (good)
        r"\bbura\b",       # बुरा (bad)
        r"\bmera\b",       # मेरा (my)
        r"\btera\b",       # तेरा (your)
        r"\bhum\b",        # हम (we)
        r"\btum\b",        # तुम (you)
    ]
    
    # Strong English indicators (common English words and patterns)
    strong_english_words = [
        r"\bthe\b",        # most common English word
        r"\band\b",        # conjunction
        r"\bfor\b",        # preposition
        r"\bis\b",         # verb (different from Hindi 'hai')
        r"\byou\b",        # pronoun
        r"\bwhat\b",       # question word
        r"\bwhere\b",      # question word
        r"\bwhen\b",       # question word
        r"\bhow\b",        # question word
        r"\bwhy\b",        # question word
        r"\bwill\b",       # modal verb
        r"\bwould\b",      # modal verb
        r"\bcould\b",      # modal verb
        r"\bcan\b",        # modal verb
        r"\bwas\b",        # past tense
        r"\bwere\b",       # past tense
        r"\bhave\b",       # auxiliary
        r"\bhas\b",        # auxiliary
        r"\bwith\b",       # preposition
        r"\bfrom\b",       # preposition
        r"\bthis\b",       # demonstrative
        r"\bthat\b",       # demonstrative
        r"\bwhich\b",      # relative pronoun
        r"\bafter\b",      # preposition
        r"\bbefore\b",     # preposition
        r"\bwhile\b",      # conjunction
        r"\bdo\b",         # auxiliary
        r"\bdoes\b",       # auxiliary
        r"\bgo\b",         # verb
    ]
    
    hindi_count = 0
    english_count = 0
    
    # Count Hindi indicators using word boundaries
    for pattern in strong_hindi_words:
        if re.search(pattern, text_lower):
            hindi_count += 1
    
    # Count English indicators using word boundaries
    for pattern in strong_english_words:
        if re.search(pattern, text_lower):
            english_count += 1
    
    # Decision logic
    # If English has more indicators, it's English
    if english_count > hindi_count:
        return "en"
    
    # If Hindi has significantly more indicators (at least 2), it's Hindi
    if hindi_count >= 2:
        return "hi"
    
    # If only 1 Hindi indicator and no English indicators, default to English
    # (to avoid false positives on English text with Hindi words)
    if hindi_count >= 1 and english_count == 0:
        return "hi"
    
    # Default to English if uncertain
    return "en"


# Test cases
if __name__ == "__main__":
    test_cases = [
        ("namaste, how are you?", "en"),  # English text with Hindi greeting
        ("mujhe samajh nahi aata kya", "hi"),  # Hindi text
        ("I am fine, thanks for asking", "en"),  # Pure English
        ("यह एक हिंदी वाक्य है", "hi"),  # Devanagari script
        ("kai ka matlab kya hai?", "en"),  # Could be ambiguous
        ("what is your name?", "en"),  # Pure English
        ("mera naam raj hai", "hi"),  # Hindi text
    ]
    
    print("Testing language detection:\n")
    for text, expected in test_cases:
        result = detect_language(text)
        status = "✓" if result == expected else "✗"
        print(f"{status} '{text}' -> {result} (expected: {expected})")