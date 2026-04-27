"""
qr_profile_fetcher.py
=====================
SSE orchestrator for the QR Emergency Profile pipeline.

Public API
----------
    stream_qr_profile(profile_id: str) -> Generator[str, None, None]

Yields Server-Sent Events (SSE) in stages:
    Event 1  "profile_data"       → all DB-sourced profile data + any cached summaries
                                     includes `summary_pending` / `insurance_pending` booleans
    Event 2  "medical_summary"    → RAG-generated lab report summary  (if not cached)
    Event 3  "insurance_summary"  → RAG-generated insurance JSON      (if not cached)
    Event 4  "complete"           → terminal event (always sent, even on error)
    Event E  "error"              → only sent if a fatal exception occurs before complete

If both summaries are cached and valid, Events 2/3 are skipped and all data
is included in Event 1 followed immediately by Event 4.

Design decisions
----------------
* ALL profile DB queries AND cache-validity checks run in ONE parallel
  ThreadPoolExecutor(max_workers=6) pass — nothing sequential before Event 1.
* All Future.result() calls happen INSIDE the `with` block so executor
  shutdown(wait=True) cannot race with result collection.
* Cache validity is checked by computing a storage-file signature and comparing
  it against the signature stored in the cache row.
* Technical DB fields (id, user_id, profile_id, created_at, updated_at) are
  stripped from the response.
* The entire generator body is wrapped in try/except; `complete` is ALWAYS
  the final yielded event so the frontend never hangs.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from concurrent.futures import ThreadPoolExecutor, Future
from datetime import datetime, timezone
from pathlib import Path
from typing import Generator, Optional

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ─────────────────────────────────────────────────────────────────────────────
# SSE formatting helper
# ─────────────────────────────────────────────────────────────────────────────

def _sse_event(event_type: str, data: dict) -> str:
    """Format a Server-Sent Event string."""
    payload = json.dumps(data, ensure_ascii=False, default=str)
    return f"event: {event_type}\ndata: {payload}\n\n"


# ─────────────────────────────────────────────────────────────────────────────
# Technical field stripping
# ─────────────────────────────────────────────────────────────────────────────

_STRIP_KEYS = {
    "id", "user_id", "profile_id", "auth_id",
    "created_at", "updated_at", "processed_at",
    "structured_extracted_at", "generated_at",
}


def _clean(obj):
    """Recursively remove technical keys from dicts / lists."""
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items() if k not in _STRIP_KEYS}
    if isinstance(obj, list):
        return [_clean(i) for i in obj]
    return obj


# ─────────────────────────────────────────────────────────────────────────────
# Data reshaping helpers — transform DB rows into frontend schema
# ─────────────────────────────────────────────────────────────────────────────

def _reshape_profile(card_data: dict, profile_info: dict, health_raw: dict) -> dict:
    """Build the ``profile`` section from card_data + profile_info + health_raw."""
    height_cm  = health_raw.get("height_cm")
    height_ft  = health_raw.get("height_ft")
    weight_kg  = health_raw.get("weight_kg")
    weight_lbs = health_raw.get("weight_lbs")

    if height_cm:
        height_str = f"{height_cm} cm"
    elif height_ft:
        height_str = f"{height_ft} ft"
    else:
        height_str = ""

    if weight_kg:
        weight_str = f"{weight_kg} kg"
    elif weight_lbs:
        weight_str = f"{weight_lbs} lbs"
    else:
        weight_str = ""

    return {
        "name":   card_data.get("name") or profile_info.get("name") or "",
        "age":    card_data.get("age") or "",
        "phone":  card_data.get("phone") or profile_info.get("phone") or "",
        "blood":  card_data.get("blood_group") or "",
        "height": height_str,
        "weight": weight_str,
        "gender": card_data.get("gender") or profile_info.get("gender") or "",
    }


def _reshape_emergency_contacts(contacts: list) -> list:
    """Reshape contacts into frontend format."""
    result = []
    for c in contacts:
        result.append({
            "name":     c.get("name") or c.get("contactName") or "",
            "phone":    c.get("phone") or c.get("contactPhone") or "",
            "relation": c.get("relation") or c.get("relationship") or "",
        })
    return result


_MEDICATION_KEYS = {"name", "dosage", "frequency", "startDate", "endDate", "purpose"}


def _reshape_medications(medications: list) -> list:
    """Keep only the 6 user-requested fields from each medication."""
    return [
        {k: med.get(k, "") for k in _MEDICATION_KEYS}
        for med in medications
    ]


def _reshape_health_current(health: dict, medications: list) -> dict:
    """Build current_medical_status from health record + medications."""
    return {
        "allergies":                    _ensure_list(health.get("allergies")),
        "current_diagnosed_condition":  _ensure_list(health.get("current_diagnosed_condition")),
        "ongoing_treatments":           _ensure_list(health.get("ongoing_treatments")),
        "long_term_treatments":         _ensure_list(health.get("long_term_treatments")),
        "medications":                  _reshape_medications(medications),
    }


def _reshape_health_past(health: dict) -> dict:
    """Build past_medical_history from health record."""
    return {
        "previous_diagnosed_conditions": _ensure_list(health.get("previous_diagnosed_conditions")),
        "childhood_illness":             _ensure_list(health.get("childhood_illness")),
        "past_surgeries":                _ensure_list(health.get("past_surgeries")),
        "family_history":                _ensure_list(health.get("family_history")),
    }


def _reshape_doctors(doctors: list) -> list:
    """Reshape medical team into frontend format."""
    result = []
    for d in doctors:
        result.append({
            "name":      d.get("name") or "",
            "specialty": d.get("speciality") or d.get("specialty") or "",
            "phone":     d.get("number") or d.get("phone") or "",
        })
    return result


def _reshape_appointments(appointments: list) -> list:
    """Reshape appointments into frontend format."""
    result = []
    for a in appointments:
        raw_date = a.get("date") or ""
        formatted_date = _format_date(raw_date)
        raw_time = a.get("time") or ""
        formatted_time = _format_time(raw_time)

        result.append({
            "doctor": a.get("doctorName") or a.get("title") or "",
            "date":   formatted_date,
            "time":   formatted_time,
            "type":   a.get("type") or "",
        })
    return result


def _reshape_documents(doc_urls: dict, folder: str) -> list:
    """Reshape signed URL entries into [{name, url}]."""
    entries = doc_urls.get(folder) or []
    return [
        {"name": e.get("file_name") or "", "url": e.get("url") or ""}
        for e in entries
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Utility helpers
# ─────────────────────────────────────────────────────────────────────────────

def _ensure_list(val) -> list:
    """Normalise a JSONB field to a list."""
    if val is None:
        return []
    if isinstance(val, list):
        return val
    if isinstance(val, str):
        return [val] if val.strip() else []
    return [val]


def _format_date(raw: str) -> str:
    """Convert YYYY-MM-DD to '28 Apr 2025' style."""
    if not raw:
        return ""
    try:
        dt = datetime.strptime(raw.strip()[:10], "%Y-%m-%d")
        return dt.strftime("%d %b %Y")
    except (ValueError, AttributeError):
        return raw


def _format_time(raw: str) -> str:
    """Convert HH:MM to '10:30 AM' style."""
    if not raw:
        return ""
    try:
        return datetime.strptime(raw.strip()[:5], "%H:%M").strftime("%I:%M %p")
    except (ValueError, AttributeError):
        return raw


# ─────────────────────────────────────────────────────────────────────────────
# Cache validation  (runs inside the ThreadPoolExecutor alongside DB queries)
# ─────────────────────────────────────────────────────────────────────────────

def _validate_summary_cache(
    profile_id: str,
    folder_type: str,
    list_user_files_fn,
    compute_sig_fn,
    get_cache_fn,
) -> tuple[Optional[dict], list[dict]]:
    """
    Check if a cached summary is still valid by comparing the current
    storage file signature against the cached one.

    Returns
    -------
    (cached_record_or_None, docs_list)
        docs_list is the doc metadata built from current storage files
        (needed for RAG generation if cache is stale).
    """
    try:
        from qr_rag_pipeline.qr_summary_generator import _build_doc_list

        storage_files = list_user_files_fn(profile_id, folder_type=folder_type) or []
        if not storage_files:
            return None, []

        docs = _build_doc_list(profile_id, storage_files, folder_type)
        if not docs:
            return None, []

        current_sig = compute_sig_fn(docs)
        cached = get_cache_fn(profile_id, expected_signature=current_sig)

        return cached, docs
    except Exception as exc:
        logger.warning(
            "_validate_summary_cache failed for profile=%s folder=%s: %s",
            profile_id, folder_type, exc,
        )
        return None, []


# ─────────────────────────────────────────────────────────────────────────────
# Public: SSE stream generator
# ─────────────────────────────────────────────────────────────────────────────

def stream_qr_profile(profile_id: str) -> Generator[str, None, None]:
    """
    Stream the complete QR emergency profile data via Server-Sent Events.

    Yields SSE-formatted strings. The caller (Flask/API route) should set
    ``Content-Type: text/event-stream`` and stream these directly.

    The `complete` event is ALWAYS the final event, even when an unhandled
    exception occurs — the frontend is therefore guaranteed never to hang.

    Parameters
    ----------
    profile_id : str
        Supabase profile UUID.

    Yields
    ------
    str
        SSE event strings (event: <type>\\ndata: <json>\\n\\n).
    """
    log_prefix = f"[qr_profile | profile={profile_id}]"
    complete_sent = False

    try:
        from supabase_helper import (
            get_profile_info,
            get_user_card_data,
            get_medications,
            get_medical_team,
            get_appointments,
            get_document_urls,
            get_emergency_contacts,
            get_full_health_record,
            list_user_files,
            compute_signature_from_docs,
            get_cached_summary,
            get_cached_insurance_summary,
        )

        logger.info("%s SSE stream started.", log_prefix)

        # ── Stage 1: ALL fetches in a single parallel pass ───────────────────
        # DB queries (8) + cache validation (2) run concurrently.
        # All .result() calls happen INSIDE the `with` block so that
        # executor.shutdown(wait=True) cannot race with result collection.

        with ThreadPoolExecutor(max_workers=6) as pool:
            f_profile:      Future = pool.submit(get_profile_info,     profile_id)
            f_card:         Future = pool.submit(get_user_card_data,   profile_id)
            f_contacts:     Future = pool.submit(get_emergency_contacts, profile_id)
            f_health:       Future = pool.submit(get_full_health_record, profile_id)
            f_medications:  Future = pool.submit(get_medications,      profile_id)
            f_doctors:      Future = pool.submit(get_medical_team,     profile_id)
            f_appointments: Future = pool.submit(get_appointments,     profile_id)
            f_doc_urls:     Future = pool.submit(get_document_urls,    profile_id)

            # Cache validation runs in parallel with DB queries — not after.
            f_med_cache: Future = pool.submit(
                _validate_summary_cache,
                profile_id, "reports",
                list_user_files, compute_signature_from_docs, get_cached_summary,
            )
            f_ins_cache: Future = pool.submit(
                _validate_summary_cache,
                profile_id, "insurance",
                list_user_files, compute_signature_from_docs, get_cached_insurance_summary,
            )

            # --- Collect ALL results while still inside the `with` block ---
            profile_info     = _safe_result(f_profile,      {})
            card_data        = _safe_result(f_card,         {})
            contacts_raw     = _safe_result(f_contacts,     [])
            health_raw       = _safe_result(f_health,       {})
            medications      = _safe_result(f_medications,  [])
            doctors_raw      = _safe_result(f_doctors,      [])
            appointments_raw = _safe_result(f_appointments, [])
            doc_urls         = _safe_result(f_doc_urls,     {})

            med_cache_result = _safe_result(f_med_cache, (None, []))
            ins_cache_result = _safe_result(f_ins_cache, (None, []))

        # Unpack cache results
        medical_cached,   medical_docs   = med_cache_result  if isinstance(med_cache_result, tuple)   else (None, [])
        insurance_cached, insurance_docs = ins_cache_result  if isinstance(ins_cache_result, tuple)   else (None, [])

        logger.info(
            "%s Stage 1 complete. medical_cache=%s insurance_cache=%s",
            log_prefix,
            "HIT" if medical_cached else "MISS",
            "HIT" if insurance_cached else "MISS",
        )

        # ── Stage 2: Determine what needs to be generated ────────────────────
        medical_needed   = not medical_cached   and bool(medical_docs)
        insurance_needed = not insurance_cached and bool(insurance_docs)

        # ── Build profile_data payload ────────────────────────────────────────
        profile_data: dict = {
            "profile":                _reshape_profile(card_data, profile_info, health_raw),
            "emergency_contact":      _reshape_emergency_contacts(contacts_raw),
            "current_medical_status": _reshape_health_current(health_raw, medications),
            "past_medical_history":   _reshape_health_past(health_raw),
            "doctors":                _reshape_doctors(doctors_raw),
            "appointments":           _reshape_appointments(appointments_raw),
            "prescriptions":          _reshape_documents(doc_urls, "prescriptions"),
            "medical_documents":      _reshape_documents(doc_urls, "reports"),
            "insurance_documents":    _reshape_documents(doc_urls, "insurance"),
            # Pending flags let the frontend show a spinner in the right tab
            # instead of "no data available" while generation is in progress.
            "summary_pending":   medical_needed,
            "insurance_pending": insurance_needed,
        }

        # Include cached summaries when available
        if medical_cached:
            profile_data["summary"] = medical_cached.get("summary_text") or ""

        if insurance_cached:
            raw_ins = insurance_cached.get("summary_text") or ""
            profile_data["insurance"] = _parse_insurance_cache(raw_ins)

        # ── SSE Event 1: profile_data ─────────────────────────────────────────
        yield _sse_event("profile_data", profile_data)
        logger.info("%s Event 1 (profile_data) sent.", log_prefix)

        # ── Stage 3: Sequential summary generation ────────────────────────────
        # (kept sequential to avoid RAM exhaustion from concurrent RAG pipelines)

        if medical_needed:
            try:
                from qr_rag_pipeline.qr_summary_generator import generate_medical_summary
                summary_text = generate_medical_summary(profile_id)
                yield _sse_event("medical_summary", {"summary": summary_text})
                logger.info("%s Event 2 (medical_summary) sent.", log_prefix)
            except Exception as exc:
                logger.exception("%s Medical summary generation failed: %s", log_prefix, exc)
                yield _sse_event("medical_summary", {
                    "summary": "Unable to generate medical summary at this time."
                })

        if insurance_needed:
            try:
                from qr_rag_pipeline.qr_summary_generator import generate_insurance_summary
                insurance_data = generate_insurance_summary(profile_id)
                yield _sse_event("insurance_summary", {"insurance": insurance_data})
                logger.info("%s Event 3 (insurance_summary) sent.", log_prefix)
            except Exception as exc:
                logger.exception("%s Insurance summary generation failed: %s", log_prefix, exc)
                yield _sse_event("insurance_summary", {
                    "insurance": _default_insurance()
                })

        # ── SSE Event 4: complete ─────────────────────────────────────────────
        yield _sse_event("complete", {"status": "done"})
        complete_sent = True
        logger.info("%s SSE stream complete.", log_prefix)

    except Exception as exc:
        logger.exception("%s Fatal unhandled error in stream_qr_profile: %s", log_prefix, exc)
        # Attempt to tell the frontend something went wrong
        try:
            yield _sse_event("error", {"message": "An unexpected error occurred loading your profile."})
        except Exception:
            pass
        # Always send `complete` so the frontend never hangs indefinitely
        if not complete_sent:
            try:
                yield _sse_event("complete", {"status": "error"})
            except Exception:
                pass


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _safe_result(future: Future, default):
    """Extract a Future result, returning *default* on any exception."""
    try:
        return future.result()
    except Exception as exc:
        logger.warning("Parallel fetch failed: %s", exc)
        return default


def _default_insurance() -> dict:
    """Return the empty insurance schema."""
    return {
        "policy_overview": {
            "insurer_name": "", "policy_number": "", "plan_name": "",
            "policy_type": "", "policy_holder_name": "",
            "insured_members": [], "status": "",
            "start_date": "", "end_date": "",
        },
        "coverage_details": {
            "total_sum_insured": 0, "remaining_coverage": 0,
            "coverage_used": 0, "room_rent_limit": "",
            "icu_coverage": "", "pre_post_hospitalization": "",
            "day_care_procedures": False,
        },
        "medical_rules": {
            "pre_existing_waiting_period": "",
            "specific_disease_waiting": "",
            "maternity_waiting_period": "",
            "covered_conditions": [], "excluded_conditions": [],
        },
        "hospital_access": {
            "cashless_available": False,
            "tpa_name": "", "tpa_helpline": "",
        },
    }


def _parse_insurance_cache(raw: str) -> dict:
    """Parse a cached insurance summary_text (JSON string) back to dict."""
    if not raw or not raw.strip():
        return _default_insurance()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            defaults = _default_insurance()
            result = {}
            for section, section_defaults in defaults.items():
                if isinstance(section_defaults, dict):
                    result[section] = {**section_defaults, **(parsed.get(section) or {})}
                else:
                    result[section] = parsed.get(section, section_defaults)
            return result
    except (json.JSONDecodeError, TypeError):
        pass
    return _default_insurance()


# ─────────────────────────────────────────────────────────────────────────────
# Manual testing
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import time

    logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")

    TEST_PROFILE_ID = "e18af8f2-9c0e-4a92-b6b5-84e8ad019186"

    print("=" * 70)
    print(f"  QR Emergency Profile — Manual Test")
    print(f"  Profile: {TEST_PROFILE_ID}")
    print("=" * 70)

    start = time.perf_counter()

    for event_str in stream_qr_profile(TEST_PROFILE_ID):
        lines = event_str.strip().split("\n")
        event_type = lines[0].replace("event: ", "")
        data_raw   = lines[1].replace("data: ", "")
        data       = json.loads(data_raw)

        elapsed = time.perf_counter() - start
        print(f"\n{'─' * 70}")
        print(f"  ⚡ SSE Event: {event_type}  (t={elapsed:.2f}s)")
        print(f"{'─' * 70}")
        print(json.dumps(data, indent=2, ensure_ascii=False, default=str))

    total = time.perf_counter() - start
    print(f"\n{'=' * 70}")
    print(f"  ✅ Complete in {total:.2f}s")
    print(f"{'=' * 70}")