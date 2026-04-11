"""
Medication summary pipeline.

Composes data access (supabase_helper) and LLM I/O (rag_query) to answer
natural-language questions about a profile's complete medication picture:
active medications, adherence logs, medical team, and health-table medication
fields (allergies, ongoing/long-term treatments, diagnosed conditions).
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Optional

from supabase_helper import (
    get_medications,
    get_medication_logs,
    get_medical_team,
    get_health_medication_data,
)
from rag_pipeline.rag_query import call_llm

_MAX_RECENT_LOGS: int = 10
_LLM_MAX_TOKENS: int = 1500


# ---------------------------------------------------------------------------
# Log merging
# ---------------------------------------------------------------------------

def _merge_logs(
    medications: list[dict[str, Any]],
    standalone_logs: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """
    Unify logs from user_medication_logs and any logs embedded inside each
    medication object.  Deduplicates by (medicationId, slotKey, timestamp);
    standalone table entries are inserted first so they remain authoritative.
    Returns medicationId → chronologically sorted log list.
    """
    merged: dict[str, list[dict[str, Any]]] = defaultdict(list)
    seen: set[tuple] = set()

    def _add(log: dict[str, Any]) -> None:
        key = (
            log.get("medicationId", ""),
            log.get("slotKey", ""),
            log.get("timestamp", ""),
        )
        if key in seen:
            return
        seen.add(key)
        merged[log["medicationId"]].append(log)

    for log in standalone_logs:
        if log.get("medicationId"):
            _add(log)

    for med in medications:
        for log in med.get("logs") or []:
            if log.get("medicationId"):
                _add(log)

    for med_id in merged:
        merged[med_id].sort(key=lambda l: l.get("timestamp", ""))

    return merged


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def _fmt_dt(ts: str) -> str:
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.strftime("%d %b %Y, %I:%M %p").lstrip("0")
    except (ValueError, AttributeError):
        return ts


def _fmt_jsonb_list(value: Any, fallback: str = "None") -> str:
    """Render a JSONB field that may be a list, dict, or scalar as a plain string."""
    if not value:
        return fallback
    if isinstance(value, list):
        items = []
        for item in value:
            if isinstance(item, dict):
                items.append(", ".join(f"{k}: {v}" for k, v in item.items() if v))
            else:
                items.append(str(item))
        return "; ".join(items) if items else fallback
    if isinstance(value, dict):
        return ", ".join(f"{k}: {v}" for k, v in value.items() if v) or fallback
    return str(value)


def _adherence_stats(logs: list[dict[str, Any]]) -> dict[str, Any]:
    total = len(logs)
    taken = sum(1 for l in logs if l.get("taken") is True)
    last_taken: Optional[str] = next(
        (l["timestamp"] for l in reversed(logs) if l.get("taken")), None
    )
    first_missed: Optional[str] = next(
        (l["timestamp"] for l in logs if not l.get("taken")), None
    )
    return {
        "total": total,
        "taken": taken,
        "missed": total - taken,
        "pct": round(taken / total * 100, 1) if total else None,
        "last_taken_ts": last_taken,
        "first_missed_ts": first_missed,
    }


# ---------------------------------------------------------------------------
# Per-source context sections
# ---------------------------------------------------------------------------

def _format_medication_block(
    med: dict[str, Any],
    logs: list[dict[str, Any]],
) -> str:
    lines: list[str] = [f"[Medication] {med.get('name', 'Unknown')}"]

    for field, label in (
        ("dosage",      "Dosage"),
        ("purpose",     "Purpose"),
        ("frequency",   "Frequency"),
        ("timesPerDay", "Times per day"),
        ("startDate",   "Start date"),
    ):
        if med.get(field):
            lines.append(f"  {label}: {med[field]}")

    meal_timing: dict = med.get("mealTiming") or {}
    if meal_timing:
        slots = ", ".join(f"{slot} ({timing})" for slot, timing in meal_timing.items())
        lines.append(f"  Meal timing: {slots}")

    if logs:
        s = _adherence_stats(logs)
        adherence = f"{s['taken']}/{s['total']} doses taken"
        if s["pct"] is not None:
            adherence += f" ({s['pct']}%)"
        lines.append(f"  Adherence: {adherence}")
        if s["missed"]:
            lines.append(f"  Missed doses: {s['missed']}")
            if s["first_missed_ts"]:
                lines.append(f"  First missed: {_fmt_dt(s['first_missed_ts'])}")
        if s["last_taken_ts"]:
            lines.append(f"  Last taken: {_fmt_dt(s['last_taken_ts'])}")

        recent = logs[-_MAX_RECENT_LOGS:]
        lines.append(f"  Log (last {len(recent)} entries):")
        for entry in recent:
            status = "✓ taken" if entry.get("taken") else "✗ missed"
            lines.append(
                f"    - {_fmt_dt(entry.get('timestamp', ''))} "
                f"| {entry.get('slotKey', '')} | {status}"
            )
    else:
        lines.append("  Adherence log: none recorded")

    return "\n".join(lines)


def _format_medications_section(
    medications: list[dict[str, Any]],
    log_map: dict[str, list[dict[str, Any]]],
) -> str:
    if not medications:
        return "ACTIVE MEDICATIONS\n  None on record."

    blocks = [f"ACTIVE MEDICATIONS ({len(medications)} total)"]
    for med in medications:
        med_id = med.get("id", "")
        blocks.append("")
        blocks.append(_format_medication_block(med, log_map.get(med_id, [])))
    return "\n".join(blocks)


def _format_medical_team_section(doctors: list[dict[str, Any]]) -> str:
    if not doctors:
        return "MEDICAL TEAM\n  None on record."

    lines = [f"MEDICAL TEAM ({len(doctors)} doctor(s))"]
    for doc in doctors:
        entry = f"  - {doc.get('name', 'Unknown')}"
        if doc.get("speciality"):
            entry += f" | {doc['speciality']}"
        if doc.get("number"):
            entry += f" | {doc['number']}"
        lines.append(entry)
    return "\n".join(lines)


def _format_health_section(health: dict[str, Any]) -> str:
    if not health:
        return "HEALTH PROFILE (medication-relevant)\n  No data on record."

    lines = ["HEALTH PROFILE (medication-relevant)"]

    allergies = _fmt_jsonb_list(health.get("allergies"))
    lines.append(f"  Allergies: {allergies}")

    conditions = _fmt_jsonb_list(health.get("current_diagnosed_condition"))
    lines.append(f"  Current diagnosed conditions: {conditions}")

    current_meds = _fmt_jsonb_list(health.get("current_medication"))
    lines.append(f"  Current medication (health record): {current_meds}")

    ongoing = _fmt_jsonb_list(health.get("ongoing_treatments"))
    lines.append(f"  Ongoing treatments: {ongoing}")

    long_term = _fmt_jsonb_list(health.get("long_term_treatments"))
    lines.append(f"  Long-term treatments: {long_term}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Context assembly
# ---------------------------------------------------------------------------

def _build_context(
    medications: list[dict[str, Any]],
    log_map: dict[str, list[dict[str, Any]]],
    doctors: list[dict[str, Any]],
    health: dict[str, Any],
) -> str:
    now_utc = datetime.now(timezone.utc).strftime("%d %b %Y, %I:%M %p UTC")
    parts = [
        f"Reference datetime (UTC): {now_utc}",
        "",
        _format_medications_section(medications, log_map),
        "",
        _format_medical_team_section(doctors),
        "",
        _format_health_section(health),
    ]
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

def _build_prompts(context: str, question: str) -> tuple[str, str]:
    system = (
        "You are a precise, empathetic medication assistant embedded in a personal "
        "health app. Answer the user's question using only the structured profile "
        "data provided below.\n\n"
        "Rules:\n"
        "1. Respond exclusively in the same language the user used.\n"
        "2. Use only the data supplied; never invent values or give clinical advice "
        "beyond what the data states.\n"
        "3. Present all dates and times in a human-readable format.\n"
        "4. Reference the medical team (doctor name, speciality) where relevant.\n"
        "5. Cross-reference the health profile (allergies, conditions, treatments) "
        "with active medications when it adds useful context to the answer.\n"
        "6. Flag missed doses clearly but without alarming language.\n"
        "7. If the data is insufficient to answer fully, say so plainly.\n"
        "8. Keep the response concise and easy to read on a mobile screen.\n"
        "9. Never expose raw JSON keys or internal field names to the user."
    )
    user = f"PROFILE DATA:\n{context}\n\nUSER QUESTION:\n{question}"
    return system, user


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def query_medications(question: str, profile_id: str) -> str:
    if not profile_id:
        return "❌ A valid profile_id is required."

    medications      = get_medications(profile_id)
    standalone_logs  = get_medication_logs(profile_id)
    doctors          = get_medical_team(profile_id)
    health           = get_health_medication_data(profile_id)

    log_map = _merge_logs(medications, standalone_logs)
    context = _build_context(medications, log_map, doctors, health)
    system, user = _build_prompts(context, question)

    try:
        return call_llm(system, user, max_tokens=_LLM_MAX_TOKENS)
    except Exception as exc:
        return f"❌ Failed to generate medication answer: {exc}"
    
if __name__ == "__main__":
    print(query_medications('what was my most recent medication and when is it scheduled','e18af8f2-9c0e-4a92-b6b5-84e8ad019186'))