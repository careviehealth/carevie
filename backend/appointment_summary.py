"""
Appointment query pipeline.

Fetches a profile's appointments from Supabase, formats them into a
structured context document, and invokes the LLM to answer the user's
natural-language question. The response language mirrors the user's query.

Orchestrator entry point: answer_appointment_query()
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Optional

from supabase_helper import get_appointments
from rag_pipeline.rag_query import call_llm

_MAX_LLM_TOKENS: int = 1024

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^\d{2}:\d{2}(:\d{2})?$")


def _parse_date(raw: str) -> Optional[date]:
    if not raw or not _DATE_RE.match(raw.strip()):
        return None
    try:
        return datetime.strptime(raw.strip(), "%Y-%m-%d").date()
    except ValueError:
        return None


def _format_time(raw: str) -> str:
    if not raw or not _TIME_RE.match(raw.strip()):
        return raw or "Not specified"
    try:
        return datetime.strptime(raw.strip()[:5], "%H:%M").strftime("%I:%M %p")
    except ValueError:
        return raw


def _render_appointment(appt_date: Optional[date], appt: dict) -> str:
    lines: list[str] = []

    date_str = appt_date.strftime("%A, %d %B %Y") if appt_date else (appt.get("date") or "Unknown")
    lines.append(f"  Date         : {date_str}")
    lines.append(f"  Time         : {_format_time(appt.get('time', ''))}")
    lines.append(f"  Type         : {appt.get('type') or 'Not specified'}")
    lines.append(f"  Title        : {appt.get('title') or 'Untitled'}")

    if appt.get("location"):
        lines.append(f"  Location     : {appt['location']}")
    if appt.get("therapyType"):
        lines.append(f"  Therapy Type : {appt['therapyType']}")
    if appt.get("therapistName"):
        lines.append(f"  Therapist    : {appt['therapistName']}")

    lines.append(f"  ID           : {appt.get('id', '')}")
    return "\n".join(lines)


def _format_appointments(appointments: list[dict]) -> str:
    if not appointments:
        return "No appointments found for this profile."

    today = date.today()

    dated: list[tuple[date, dict]] = []
    undated: list[dict] = []

    for appt in appointments:
        parsed = _parse_date(appt.get("date", ""))
        if parsed:
            dated.append((parsed, appt))
        else:
            undated.append(appt)

    dated.sort(key=lambda x: x[0])

    upcoming = [(d, a) for d, a in dated if d >= today]
    past = [(d, a) for d, a in dated if d < today]

    sections: list[str] = []

    if upcoming:
        sections.append(f"UPCOMING APPOINTMENTS ({len(upcoming)}):")
        for appt_date, appt in upcoming:
            sections.append(_render_appointment(appt_date, appt))

    if past:
        sections.append(f"PAST APPOINTMENTS ({len(past)}):")
        for appt_date, appt in reversed(past):
            sections.append(_render_appointment(appt_date, appt))

    if undated:
        sections.append(f"APPOINTMENTS WITH UNRECOGNISED DATES ({len(undated)}):")
        for appt in undated:
            sections.append(_render_appointment(None, appt))

    sections.append(f"Today's date: {today.strftime('%A, %d %B %Y')}")
    return "\n\n".join(sections)


def _build_prompts(user_query: str, formatted_context: str) -> tuple[str, str]:
    system_prompt = (
        "You are a personal health assistant helping users understand their "
        "scheduled appointments. Answer concisely and accurately using only "
        "the appointment data provided. Respond in the exact same language "
        "that the user used in their question — do not translate or switch "
        "languages under any circumstance. If no relevant appointment data "
        "exists for the question, say so politely in that same language. "
        "Never fabricate appointments, dates, or details."
    )

    user_prompt = (
        f"APPOINTMENT DATA:\n{formatted_context}\n\n"
        f"USER QUESTION:\n{user_query}"
    )

    return system_prompt, user_prompt


def answer_appointment_query(profile_id: str, user_query: str) -> str:
    """
    Full appointment query pipeline.

    Fetches appointments for the given profile, formats them into a structured
    context document, constructs prompts, and returns the LLM-generated answer.
    Always returns a string — never raises — so the orchestrator can pass the
    result through without additional error handling.

    Args:
        profile_id: UUID of the profile whose appointments are queried.
        user_query:  The user's natural-language question.

    Returns:
        LLM-generated answer in the same language as the user's query.
    """
    if not profile_id or not str(profile_id).strip():
        return "Unable to retrieve appointments: profile ID is missing."

    if not user_query or not user_query.strip():
        return "Please provide a question about your appointments."

    print(f"\n📅 Appointment query pipeline — profile: {profile_id}", flush=True)

    appointments = get_appointments(str(profile_id).strip())
    print(f"   Retrieved {len(appointments)} appointment(s)", flush=True)

    formatted_context = _format_appointments(appointments)
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
        return "Sorry, I was unable to answer your appointment question right now. Please try again."
    
if __name__ == "__main__":
    print(answer_appointment_query(user_query='get me details about my upcoming appointments',profile_id='e18af8f2-9c0e-4a92-b6b5-84e8ad019186'))