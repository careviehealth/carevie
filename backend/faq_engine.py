# backend/faq_engine.py

from faq_data import FAQS
from language import detect_language

def find_faq_match(user_text: str, lang: str = "en"):
    text = user_text.lower()

    # Detect language if not provided
    if lang == "en":
        detected_lang = detect_language(user_text)
        if detected_lang != "en":
            lang = detected_lang

    for faq in FAQS:
        for keyword in faq["keywords"]:
            if keyword in text:
                # Use detected language if available, fallback to English
                if isinstance(faq["answer"], dict) and lang in faq["answer"]:
                    answer = faq["answer"][lang]
                else:
                    answer = faq["answer"]["en"] if isinstance(faq["answer"], dict) and "en" in faq["answer"] else faq["answer"]
                return {
                    "matched": True,
                    "answer": answer,
                    "handoff": faq["handoff"],
                    "faq_id": faq["id"],
                    "language": lang
                }

    return {
        "matched": False
    }
