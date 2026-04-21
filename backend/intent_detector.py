"""
intent_detector.py
==================
Enterprise-grade Intent Detection Module for CareVie Healthcare Platform.

This module receives a user message and profile_id, leverages the Groq API
(LLaMA 3.3 70B Versatile) to classify the message into one of the predefined
healthcare-specific intents, and routes it to the appropriate handler function.

Author  : CareVie Platform Team
Version : 1.0.0
"""

import os
import random
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Groq Client Initialisation
# ---------------------------------------------------------------------------

_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------

INTENT_DETECTION_SYSTEM_PROMPT = """
You are CareVie's Precision Intent Classification Engine — a mission-critical,
zero-tolerance NLP component embedded within an enterprise-grade healthcare
management platform called CareVie.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERATIONAL MANDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Your sole responsibility is to analyse the incoming user message and return
EXACTLY ONE intent label from the approved taxonomy below.

You must NOT:
  • Generate any explanatory text, sentences, punctuation, or markdown.
  • Return multiple intents or a ranked list.
  • Hallucinate an intent outside the taxonomy.
  • Add prefixes such as "Intent:" or "The intent is".

You MUST:
  • Return one bare lowercase string that matches exactly one of the
    approved labels.
  • Apply the classification rules strictly and deterministically.
  • Treat ambiguity conservatively — when genuinely uncertain between two
    healthcare intents, prefer the more specific one. If no healthcare intent
    fits, fall back to `unknown`.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
APPROVED INTENT TAXONOMY & CLASSIFICATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. user_appointment
   Trigger  : Any question or statement about the user's appointments.
   Includes : Scheduling, rescheduling, cancelling, upcoming appointment
              dates/times, doctor name for appointment, appointment reminders,
              appointment history, slot availability, consultation timings.
   Examples : "When is my next appointment?", "Can I reschedule my visit?",
              "Who is my doctor tomorrow?", "Do I have any appointments this week?"

2. user_medication
   Trigger  : Any question or statement about the user's current or past
              medications, dosage, intake schedule, or medication compliance.
   Includes : Active prescriptions, medication names, dosage instructions,
              whether a dose was taken, breakfast/meal-linked medication reminders,
              medication history, refill status, side-effect queries tied to a
              prescribed drug.
   Examples : "What medications am I currently on?", "Did I take my morning pill?",
              "What is the dosage of my blood pressure medicine?",
              "Show me my medication history."

3. user_insurance
   Trigger  : Any question about the user's health insurance.
   Includes : Policy number, coverage details, claim status, premium due dates,
              network hospitals, insurance provider, policy expiry, co-pay details,
              pre-authorisation, benefits summary.
   Examples : "What is my insurance policy number?", "When does my coverage expire?",
              "Is this hospital covered under my plan?", "How do I file a claim?"

4. user_card
   Trigger  : The user explicitly asks for one or more of these data points ONLY:
              name, age, gender, height, weight, blood group, address, BMI.
   Important: This intent fires ONLY when the question maps directly to these
              profile card fields. Do NOT use this intent for broader medical
              history or health condition queries.
   Examples : "What is my blood group?", "What is my current BMI?",
              "What address do you have on file for me?", "What is my height and weight?"

5. summary_related
   Trigger  : Any request for a summary, overview, or analytical interpretation
              of the user's medical data.
   Includes : Medical history summaries, lab report analysis, blood sugar trends,
              health condition overviews, diagnostic summaries, past visit notes,
              chronic condition status, wellness score, health progress.
   Examples : "Summarise my medical history.", "What do my lab reports say?",
              "Give me an overview of my health condition.",
              "What are my recent blood sugar readings?"

6. bills
   Trigger  : Any question about the user's medical bills, invoices, payment
              receipts, charges, amounts due, paid/unpaid status, or bill
              line items.
   Includes : Hospital invoices, doctor bills, pharmacy receipts, lab charges,
              total billed amount, insurance adjustment shown on bill, due date,
              outstanding balance, payment history from receipts.
   Excludes : Insurance policy terms/coverage/claim rules (→ user_insurance).
   Examples : "How much do I need to pay in my latest bill?",
              "Show my hospital bill details.",
              "Do I have any unpaid medical receipts?",
              "What is the total amount in my pharmacy invoices?"

7. platform_related
   Trigger  : Any question about the CareVie platform itself — its features,
              functionality, navigation, or technical issues.
   Includes : Login/logout problems, account settings, feature explanations,
              FAQs, data privacy questions, notification issues, app bugs,
              how-to questions about using CareVie, billing for the platform,
              onboarding help, contacting support.
   Examples : "How do I update my profile?", "I can't log in to CareVie.",
              "What features does CareVie offer?", "How do I export my records?",
              "Is my data secure on this platform?"

8. greeting
   Trigger  : A standalone social/conversational opener with NO embedded question
              or request about any health or platform topic.
   Includes : hi, hey, hello, good morning, good evening, what's up, howdy,
              namaste, greetings, yo, sup, and close variants thereof.
   Excludes : Any message where a greeting is combined with a question or request
              (e.g., "Hi, when is my appointment?" → user_appointment).
   Examples : "Hi!", "Hello there", "Hey!", "Good morning", "Heyy"

9. unknown
   Trigger  : Any message that does not map to intents 1–8.
   Includes : Off-topic questions (weather, sports, cooking, general knowledge),
              nonsensical input, abusive text, political questions, queries about
              other healthcare platforms, celebrity health gossip, anything
              entirely outside CareVie's domain.
   Examples : "What's the weather today?", "Who won the cricket match?",
              "Tell me a joke.", "What is 2+2?", "How do I cook pasta?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT CONTRACT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY one of these exact strings (no quotes, no newlines, nothing else):

  user_appointment
  user_medication
  user_insurance
  user_card
  summary_related
  bills
  platform_related
  greeting
  unknown

Any deviation from this contract is a critical system failure.
""".strip()

# ---------------------------------------------------------------------------
# Valid Intents
# ---------------------------------------------------------------------------

VALID_INTENTS = frozenset({
    "user_appointment",
    "user_medication",
    "user_insurance",
    "user_card",
    "summary_related",
    "bills",
    "platform_related",
    "greeting",
    "unknown",
})

# ---------------------------------------------------------------------------
# Placeholder Handler Functions
# ---------------------------------------------------------------------------

def handle_user_appointment(message: str, profile_id: str) -> dict:
    """Placeholder: Fetch and respond with appointment-related data."""
    # TODO: Query appointments table/service for this profile_id
    return {"success": True, "message": f"[PLACEHOLDER] Handling appointment query for profile {profile_id}: '{message}'"}


def handle_user_medication(message: str, profile_id: str) -> dict:
    """Placeholder: Fetch and respond with medication-related data."""
    # TODO: Query prescriptions/medication service for this profile_id
    return {"success": True, "message": f"[PLACEHOLDER] Handling medication query for profile {profile_id}: '{message}'"}


def handle_user_insurance(message: str, profile_id: str) -> dict:
    """Placeholder: Fetch and respond with insurance-related data."""
    # TODO: Query insurance records service for this profile_id
    return {"success": True, "message": f"[PLACEHOLDER] Handling insurance query for profile {profile_id}: '{message}'"}


def handle_user_card(message: str, profile_id: str) -> dict:
    """Placeholder: Fetch and respond with profile card data (name, age, BMI, etc.)."""
    # TODO: Query user profile card service for this profile_id
    return {"success": True, "message": f"[PLACEHOLDER] Handling profile card query for profile {profile_id}: '{message}'"}


def handle_summary_related(message: str, profile_id: str) -> dict:
    """Placeholder: Generate and return a medical summary for the user."""
    # TODO: Invoke medical summarisation pipeline for this profile_id
    return {"success": True, "message": f"[PLACEHOLDER] Handling summary query for profile {profile_id}: '{message}'"}


def handle_platform_related(message: str) -> dict:
    """Answer CareVie platform queries from the platform knowledge-base RAG."""
    try:
        from platform_related.platform_handler import handle_platform_query

        result = handle_platform_query(message)
        if isinstance(result, dict):
            return result
        return {"success": False, "message": "Platform pipeline returned an invalid response."}
    except Exception as exc:
        return {
            "success": False,
            "message": (
                "I was unable to process your platform request right now. "
                f"Please try again. (Error: {exc})"
            ),
        }


def handle_greeting(message: str) -> dict:
    """Return a randomly selected friendly greeting response."""
    greeting_responses = (
        "Hello! Welcome to CareVie. How can I assist you with your health today?",
        "Hey there! Great to see you on CareVie. What can I help you with?",
        "Hi! I'm your CareVie health assistant. How may I support you today?",
        "Hello! Hope you're doing well. What health information can I help you find?",
        "Hey! Welcome back to Carevie. Is there something I can help you with today?",
        "Hi there! Your health is our priority. What would you like to know?",
        "Hello! Good to have you here. Feel free to ask me anything about your health records.",
        "Hey! I'm here and ready to help. What's on your mind today?",
    )
    return {"success": True, "message": random.choice(greeting_responses)}


def handle_unknown(message: str) -> dict:
    """Return a polite redirection message for out-of-scope queries."""
    return {
        "success": False,
        "message": (
            "I'm sorry, I can only assist with questions related to CareVie and your "
            "health records — such as appointments, medications, insurance, profile details, "
            "medical summaries, or platform support. Please ask a relevant question and I'll "
            "be happy to help!"
        ),
    }

# ---------------------------------------------------------------------------
# Core Intent Detection Function
# ---------------------------------------------------------------------------

def detect_intent(message: str, profile_id: str | None = None) -> dict:
    """
    Detect the intent of a user message and route it to the correct handler.

    Parameters
    ----------
    message    : str        — The raw user message from the frontend / API call.
    profile_id : str | None — The unique identifier of the authenticated user.
                              Optional for public intents (greeting, unknown,
                              platform_related). Required for all personalised
                              health-data intents — unauthenticated callers will
                              receive a login prompt for those intents.

    Returns
    -------
    dict with keys:
        success (bool)  — Whether the operation completed successfully.
        message (str)   — The handler's response string.
    """

    if not message or not message.strip():
        return {"success": False, "message": "Message cannot be empty. Please provide a valid query."}

    # ── Step 1: Call Groq LLM for intent classification ──────────────────────
    try:
        completion = _client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": INTENT_DETECTION_SYSTEM_PROMPT},
                {"role": "user",   "content": message.strip()},
            ],
            temperature=0.0,        # Deterministic output — critical for intent routing
            max_tokens=10,          # Intent label is always a short string
            top_p=1.0,
            stream=False,
        )

        raw_intent = completion.choices[0].message.content.strip().lower()

    except Exception as exc:
        return {
            "success": False,
            "message": f"Intent detection service is temporarily unavailable. Please try again later. (Error: {exc})",
        }

    # ── Step 2: Validate the returned intent ─────────────────────────────────
    intent = raw_intent if raw_intent in VALID_INTENTS else "unknown"

    # ── Step 3: Route to the appropriate handler ─────────────────────────────

    # Intents that do NOT require authentication — serve immediately
    if intent == "greeting":
        return handle_greeting(message)

    if intent == "unknown":
        return handle_unknown(message)

    if intent == "platform_related":
        return handle_platform_related(message)

    # All remaining intents require a valid authenticated profile_id
    _pid = str(profile_id).strip() if profile_id else ""
    if not _pid:
        return {
            "success": False,
            "message": (
                "It looks like you're not logged in. Please log in to your CareVie "
                "account to access your personal health information."
            ),
        }
    
    

    if intent == "user_appointment":
        try:
            from appointment_summary import answer_appointment_query
            answer = answer_appointment_query(profile_id=_pid, user_query=message)
            return {"success": True, "message": answer}
        except Exception as exc:
            return {
                "success": False,
                "message": (
                    "I was unable to process your appointment request right now. "
                    f"Please try again. (Error: {exc})"
                ),
            }

    elif intent == "user_medication":
        try:
            from medication_summary import query_medications
            answer = query_medications(question=message, profile_id=_pid)
            return {"success": True, "message": answer}
        except Exception as exc:
            return {
                "success": False,
                "message": (
                    "I was unable to process your medication request right now. "
                    f"Please try again. (Error: {exc})"
                ),
            }

    elif intent == "user_insurance":
        try:
            from insurance_summary.insurance_handler import handle_insurance_query
            result = handle_insurance_query(profile_id=_pid, user_question=message)
            if isinstance(result, dict):
                return result
            return {"success": False, "message": "Insurance pipeline returned an invalid response."}
        except Exception as exc:
            return {
                "success": False,
                "message": (
                    "I was unable to process your insurance request right now. "
                    f"Please try again. (Error: {exc})"
                ),
            }

    elif intent == "user_card":
        try:
            from user_card_summary import answer_user_card_query
            answer = answer_user_card_query(profile_id=_pid, user_query=message)
            return {"success": True, "message": answer}
        except Exception as exc:
            return {
                "success": False,
                "message": (
                    "I was unable to process your profile card request right now. "
                    f"Please try again. (Error: {exc})"
                ),
            }

    elif intent == "summary_related":
        try:
            from labreport_summary.lab_report_handler import handle_lab_report_query

            lab_result = handle_lab_report_query(profile_id=_pid, user_question=message)
            if isinstance(lab_result, dict):
                return lab_result
            return {"success": False, "message": "Summary pipeline returned an invalid response."}
        except Exception as exc:
            return {
                "success": False,
                "message": (
                    "I was unable to process your summary request right now. "
                    f"Please try again. (Error: {exc})"
                ),
            }

    elif intent == "bills":
        try:
            from medical_bills.medicalbill_handler import handle_medical_bills_query
            result = handle_medical_bills_query(profile_id=_pid, user_question=message)
            if isinstance(result, dict):
                return result
            return {"success": False, "message": "Bills pipeline returned an invalid response."}
        except Exception as exc:
            return {
                "success": False,
                "message": (
                    "I was unable to process your bills request right now. "
                    f"Please try again. (Error: {exc})"
                ),
            }

    # Fallback safety net — should never be reached
    return handle_unknown(message)


# ---------------------------------------------------------------------------
# CLI Entry Point (for quick local testing)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # (message, profile_id)  — None simulates an unauthenticated / guest user
    test_cases = [
        # ── Authenticated users ──────────────────────────────────────────────
        ("When is my next appointment?",            "profile_001"),
        ("What medications am I currently taking?", "profile_002"),
        ("What is my insurance policy number?",     "profile_003"),
        ("What is my blood group?",                 "profile_004"),
        ("Give me a summary of my medical history", "profile_005"),
        # ── Public intents — no login required ──────────────────────────────
        ("I can't log in to CareVie",               None),           # platform_related
        ("Hey!",                                    None),           # greeting
        ("What's the weather like today?",          None),           # unknown
        # ── Unauthenticated user asking a protected intent ───────────────────
        ("When is my next appointment?",            None),           # should prompt login
        ("Show me my lab report summary",           None),           # should prompt login
    ]

    print("\n" + "=" * 65)
    print("  CareVie Intent Detector — Test Run")
    print("=" * 65)

    for msg, pid in test_cases:
        result = detect_intent(msg, pid)
        print(f"\nMessage    : {msg}")
        print(f"Profile ID : {pid!r}")
        print(f"Success    : {result['success']}")
        print(f"Response   : {result['message']}")
        print("-" * 65)
