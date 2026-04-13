"""
User card query pipeline.

Fetches a profile's identity and health card fields from Supabase, formats
them into a structured context document, and invokes the LLM to answer the
user's natural-language question. The response language mirrors the user's query.

Orchestrator entry point: answer_user_card_query()
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from supabase_helper import get_user_card_data
from rag_pipeline.rag_query import call_llm

_MAX_LLM_TOKENS: int = 512


def _format_date_of_birth(raw: str) -> str:
    if not raw:
        return "Not specified"
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(raw.strip(), fmt).strftime("%d %B %Y")
        except ValueError:
            continue
    return raw


def _format_bmi(raw) -> str:
    if raw is None:
        return "Not specified"
    try:
        value = float(raw)
        if value < 18.5:
            category = "Underweight"
        elif value < 25.0:
            category = "Normal"
        elif value < 30.0:
            category = "Overweight"
        else:
            category = "Obese"
        return f"{value:.1f} ({category})"
    except (TypeError, ValueError):
        return str(raw)


def _format_user_card(card: dict) -> str:
    if not card:
        return "No user card data found for this profile."

    def _field(label: str, value) -> str:
        return f"  {label:<16}: {value if value not in (None, '', []) else 'Not specified'}"

    lines = [
        "USER CARD:",
        _field("Name", card.get("name")),
        _field("Gender", card.get("gender")),
        _field("Date of Birth", _format_date_of_birth(card.get("date_of_birth"))),
        _field("Age", card.get("age")),
        _field("Blood Group", card.get("blood_group")),
        _field("BMI", _format_bmi(card.get("bmi"))),
        _field("Phone", card.get("phone")),
        _field("Address", card.get("address")),
    ]

    return "\n".join(lines)


def _build_prompts(user_query: str, formatted_context: str) -> tuple[str, str]:
    system_prompt = (
        "You are a personal health assistant helping users review their profile "
        "and health card information. Answer concisely and accurately using only "
        "the user card data provided. Respond in the exact same language that the "
        "user used in their question — do not translate or switch languages under "
        "any circumstance. If the requested information is not present in the data, "
        "say so politely in that same language. Never fabricate personal details."
    )

    user_prompt = (
        f"USER CARD DATA:\n{formatted_context}\n\n"
        f"USER QUESTION:\n{user_query}"
    )

    return system_prompt, user_prompt


def answer_user_card_query(profile_id: str, user_query: str) -> str:
    """
    Full user card query pipeline.

    Fetches card fields for the given profile, formats them into a structured
    context document, constructs prompts, and returns the LLM-generated answer.
    Always returns a string — never raises — so the orchestrator can pass the
    result through without additional error handling.

    Args:
        profile_id: UUID of the profile to query.
        user_query:  The user's natural-language question.

    Returns:
        LLM-generated answer in the same language as the user's query.
    """
    if not profile_id or not str(profile_id).strip():
        return "Unable to retrieve user card: profile ID is missing."

    if not user_query or not user_query.strip():
        return "Please provide a question about your profile or health card."

    print(f"\n🪪 User card query pipeline — profile: {profile_id}", flush=True)

    card = get_user_card_data(str(profile_id).strip())
    print(f"   Card data fetched: {'yes' if card else 'empty'}", flush=True)

    formatted_context = _format_user_card(card)
    system_prompt, user_prompt = _build_prompts(user_query, formatted_context)

    try:
        answer = call_llm(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=_MAX_LLM_TOKENS,
        )
        print(f"   ✅ Answer generated ({len(answer)} chars)", flush=True)
        return answer
    except Exception as exc:
        print(f"   ❌ LLM call failed: {exc}", flush=True)
        return "Sorry, I was unable to answer your question right now. Please try again."
    
if __name__ == "__main__":
    print(answer_user_card_query(user_query='kya mere body details ke hisaab se mera bmi healthy hai unhealthy, detail me batao',profile_id='e18af8f2-9c0e-4a92-b6b5-84e8ad019186'))