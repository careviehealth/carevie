# ─────────────────────────────────────────────
# intent_detector.py
# ─────────────────────────────────────────────

import os
import re
import random
from groq import Groq
from dotenv import load_dotenv


load_dotenv()

GREETING_RESPONSES = [
    "Hello! How can I help you today?",
    "Hi there! What can I do for you?",
    "Hey! Need any help?",
    "Namaste! How can I assist you?",
    "Hi! Ask me anything about your health info.",
    "Hello! I'm here to help you.",
    "Hey there! What would you like to know?",
    "Hi! How can I support you today?",
    "Hello! Need help with appointments or medicines?",
    "Hey! I'm ready to assist you.",
    "Hi! What can I help you with today?",
    "Hello! Feel free to ask anything.",
    "Hey! How's it going? Need help?",
    "Hi there! Let me know what you need.",
    "Hello! I'm here whenever you need help."
]

def get_greeting_response() -> str:
    return random.choice(GREETING_RESPONSES)


VALID_INTENTS = [
    "user_appointment",
    "user_medication",
    "user_insurance",
    "profile_card",
    "summary",
    "platform",
    "greeting",
    "unknown",
]

SYSTEM_PROMPT = """You are an intent classifier for a healthcare app.

Classify the user's message into EXACTLY ONE intent.
Return ONLY the intent word. No explanation. No punctuation. No extra text.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VALID INTENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
user_appointment
user_medication
user_insurance
profile_card
summary
platform
greeting
unknown

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE CLASSIFICATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2. If the user asks GENERAL / HOW-TO / INFORMATION → use platform
3. If the user asks about REPORTS / TEST RESULTS → use summary
4. If the user asks about PERSONAL DETAILS → use profile_card
5. Greeting + real question → IGNORE greeting, classify the real intent

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTENT DEFINITIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. greeting  
Casual greeting ONLY, no real question  
Examples:  
"hi", "hello", "hey", "namaste"  


2. user_appointment  
User asking about THEIR OWN appointments  
Examples:  
"my appointment kab hai"  
"show my appointments"  
"reschedule my booking"  


3. user_medication  
User asking about THEIR OWN medicines  
Examples:  
"my medicines"  
"meri dawai kya hai"  
"what medicines am I taking"  


4. user_insurance  
User asking about THEIR OWN insurance  
Examples:  
"my insurance details"  
"claim status kya hai"  
"my policy"  


5. profile_card  
User asking about THEIR OWN personal info  
(name, phone, age, address)  
Examples:  
"my profile"  
"mera phone number kya hai"    

6. summary  
User asking about THEIR OWN health reports / lab results  
Examples:  
"my report"  
"mera WBC kya hai"  
"blood test result"  
"health summary"  


7. platform  
ANY general question, explanation, or HOW-TO  
NOT about user's own data  

Examples:  
"what is WBC?"  
"how to add appointment?"  
"insurance kya hota hai?"  
"how to upload report?"  
"how does this app work?"  

IMPORTANT:  
If the question is "how to add / how to use / what is" → ALWAYS platform  

8. unknown  
Gibberish or unrelated input  
Examples:  
"asdfgh"  
"12345"  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT DECISION LOGIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
- Reports / lab values → summary  
- Personal identity info → profile_card  
- How-to / explanation → platform  
- No clear meaning → unknown  

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY one word from VALID INTENTS.
No explanation. No extra text."""


def _get_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise EnvironmentError("GROQ_API_KEY is not set in environment variables.")
    return Groq(api_key=api_key)


def normalize_intent(raw: str) -> str:
    """Map cleaned model output to a valid internal intent."""
    if "platform" in raw:
        return "platform"
    elif "summary" in raw:
        return "summary"
    elif "appointment" in raw:
        return "user_appointment"
    elif "medication" in raw:
        return "user_medication"
    elif "insurance" in raw:
        return "user_insurance"
    elif "profile_card" in raw or "card" in raw:
        return "profile_card"
    elif "greeting" in raw:
        return "greeting"
    else:
        return "unknown"


def detect_intent(message: str) -> str:
    if not message or not message.strip():
        return "unknown"

    try:
        client = _get_client()
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": message},
            ],
            temperature=0,
            max_tokens=10,
        )

        raw = response.choices[0].message.content.strip().lower()
        raw = re.sub(r"[^a-z_]", "", raw)   # keep only a-z and underscore
        return normalize_intent(raw)

    except EnvironmentError as e:
        print(f"[IntentDetector CONFIG ERROR] {e}")
        return "unknown"
    except Exception as e:
        print(f"[IntentDetector ERROR] {e}")
        return "unknown"


def detect_intent_with_response(message: str):
    intent = detect_intent(message)

    if intent == "greeting":
        return {
            "intent": intent,
            "answer": get_greeting_response(message)
        }

    if intent == "unknown":
        return {
            "intent": intent,
            "answer": "Sorry, I can only assist with platform-related queries. Please ask something relevant."
        }

    return {
        "intent": intent,
        "answer": f"Detected intent: {intent}"
    }
