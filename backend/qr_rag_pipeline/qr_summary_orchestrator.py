"""
qr_summary_orchestrator.py
==========================
QR-code emergency summary generator.

Triggered by ``all_users_data.py`` to produce:
  • A plain-text medical SOS summary for doctors  (stored in ``medical_summaries_cache``)
  • A plain-text insurance priority summary        (stored in ``insurance_summary_cache``)

Design
------
- Uses ``qr_index_manager`` — a self-contained incremental FAISS index manager that
  lives entirely within ``qr_rag_pipeline/``.  It accepts ``vector_dir`` as an *explicit
  parameter* so it never touches global state and is fully thread-safe.
- NO imports from ``labreport_summary`` or ``insurance_summary`` — eliminates prior
  thread-safety hazard where ``VECTOR_BASE_DIR`` was monkey-patched at runtime.
- All signature computation delegates to ``supabase_helper.compute_signature_from_docs``
  for consistency with the rest of the backend.
- Download / temp-file utilities are defined locally (handler modules are not importable
  packages from sub-packages).
- Signature-based cache invalidation: if documents haven't changed the cached
  summary is returned immediately (zero LLM cost).
"""

from __future__ import annotations

import concurrent.futures
import logging
import os
import re
import sys
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Iterator, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Lazy module loading — mirrors every working handler's pattern
# ─────────────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_modules() -> dict:
    """
    Import all runtime dependencies once and cache them for the lifetime of
    the process.  ``lru_cache(maxsize=1)`` means:

      • The first call pays the full import cost and may raise ``ImportError``.
      • Every subsequent call returns the cached dict instantly.
      • There is no module-level import that could crash the process at startup.
    """
    import supabase_helper as sb
    from qr_rag_pipeline.qr_index_manager import (
        update_index,
        get_docs_delta,
        search_index,
        invalidate_index,
    )
    from rag_pipeline.rag_query import call_llm
    from rag_pipeline.profile_checker import filter_reports_by_name

    return {
        "sb":                     sb,
        "update_index":           update_index,
        "get_docs_delta":         get_docs_delta,
        "search_index":           search_index,
        "invalidate_index":       invalidate_index,
        "call_llm":               call_llm,
        "filter_reports_by_name": filter_reports_by_name,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Vector storage directories (separate from the interactive-query indices)
# ─────────────────────────────────────────────────────────────────────────────

QR_MEDICAL_VECTOR_DIR: str = os.getenv(
    "QR_MEDICAL_VECTOR_DIR",
    os.path.join("vectors", "qr_medical_summary"),
)
QR_INSURANCE_VECTOR_DIR: str = os.getenv(
    "QR_INSURANCE_VECTOR_DIR",
    os.path.join("vectors", "qr_insurance_summary"),
)

_QR_NAME_MATCH_THRESHOLD: float = float(os.getenv("QR_NAME_MATCH_THRESHOLD", "0.75"))
_MAX_DOWNLOAD_WORKERS:    int   = int(os.getenv("QR_DOWNLOAD_WORKERS", "4"))

# ─────────────────────────────────────────────────────────────────────────────
# Retrieval queries (used for FAISS search before LLM call)
# ─────────────────────────────────────────────────────────────────────────────

_MEDICAL_RETRIEVAL_QUERY = (
    "Emergency clinical highlights: critical allergies, active chronic conditions, "
    "essential medications with dosages, recent abnormal findings with values and dates, "
    "major surgeries or implants, and urgent safety risks."
)

_INSURANCE_RETRIEVAL_QUERY = (
    "Insurance policy essentials: insurer name, policy number, validity dates, sum insured, "
    "remaining coverage, room rent limit, ICU coverage, waiting periods, exclusions, "
    "cashless access, TPA name, TPA helpline, and claim procedure."
)


# ─────────────────────────────────────────────────────────────────────────────
# Download / temp-file utilities
# ─────────────────────────────────────────────────────────────────────────────

def _download_one(doc: dict, get_file_bytes_fn) -> tuple[str, str]:
    """Download one document to a named temp file. Returns (logical_path, temp_path)."""
    logical_path: str = doc["file_path"]
    ext: str = os.path.splitext(doc.get("file_name", ""))[-1] or ".pdf"
    raw_bytes: bytes = get_file_bytes_fn(logical_path)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        tmp.write(raw_bytes)
    finally:
        tmp.close()
    logger.debug("Downloaded '%s' → temp '%s' (%d bytes)", logical_path, tmp.name, len(raw_bytes))
    return logical_path, tmp.name


@contextmanager
def _temp_file_context(temp_paths: list[str]) -> Iterator[None]:
    """Unconditionally remove every path in temp_paths on exit."""
    try:
        yield
    finally:
        for path in temp_paths:
            try:
                os.unlink(path)
            except OSError:
                pass


def _concurrent_download(docs_to_fetch: list[dict], get_file_bytes_fn) -> dict[str, str]:
    """
    Download docs_to_fetch in parallel.
    Returns {logical_file_path: temp_file_path} for successful downloads only.
    """
    file_paths: dict[str, str] = {}
    if not docs_to_fetch:
        return file_paths

    workers = min(_MAX_DOWNLOAD_WORKERS, len(docs_to_fetch))
    logger.info("QR: downloading %d file(s) with %d worker(s).", len(docs_to_fetch), workers)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        future_to_doc = {
            pool.submit(_download_one, doc, get_file_bytes_fn): doc
            for doc in docs_to_fetch
        }
        for future in concurrent.futures.as_completed(future_to_doc):
            doc = future_to_doc[future]
            try:
                logical, tmp = future.result()
                file_paths[logical] = tmp
            except Exception as exc:
                logger.error("QR: failed to download '%s': %s", doc.get("file_name"), exc)

    logger.info("QR: download complete: %d/%d succeeded.", len(file_paths), len(docs_to_fetch))
    return file_paths


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_path(path: str) -> str:
    """Normalize a file path for reliable comparison."""
    return re.sub(r"/+", "/", (path or "").strip()).strip("/").lower()


def _build_docs(profile_id: str, folder_type: str) -> list[dict]:
    """Build doc metadata list from Supabase storage listing."""
    sb = _load_modules()["sb"]
    files = sb.list_user_files(profile_id, folder_type=folder_type) or []
    docs: list[dict] = []
    for f in files:
        file_name = (f.get("name") or "").strip()
        if not file_name:
            continue
        file_path = f"{profile_id}/{folder_type}/{file_name}".replace("//", "/")
        metadata = f.get("metadata") if isinstance(f.get("metadata"), dict) else {}
        source_hash = metadata.get("etag") or metadata.get("eTag") or ""
        docs.append({
            "id":               file_path,
            "file_path":        file_path,
            "file_name":        file_name,
            "extracted_text":   "",
            "source_file_hash": source_hash,
        })
    return docs


def _compute_docs_signature(docs: list[dict]) -> str:
    """
    Compute document set signature using the *same algorithm* as the rest of
    the backend (``supabase_helper.compute_signature_from_docs``).
    """
    sb = _load_modules()["sb"]
    return sb.compute_signature_from_docs(docs)


def _resolve_user_name(profile_id: str) -> str:
    sb = _load_modules()["sb"]
    try:
        info = sb.get_profile_info(profile_id) or {}
        return (info.get("display_name") or info.get("name") or "").strip()
    except Exception:
        return ""


def _filter_docs_by_user_name(
    profile_id: str,
    folder_type: str,
    docs: list[dict],
    user_name: str,
) -> list[dict]:
    """
    Keep only documents whose extracted patient_name matches user_name.
    Falls back to the full list if no processed metadata exists yet.
    """
    if not docs or not user_name:
        return docs

    mods = _load_modules()
    sb = mods["sb"]
    filter_reports_by_name = mods["filter_reports_by_name"]

    try:
        processed = sb.get_processed_reports(profile_id, folder_type=folder_type) or []
    except Exception:
        processed = []

    if not processed:
        return docs  # No metadata yet; allow all docs (safe fallback)

    filtered = filter_reports_by_name(processed, user_name, threshold=_QR_NAME_MATCH_THRESHOLD)

    # Normalize paths before comparing to handle format mismatches between
    # storage-derived paths and DB-stored paths
    matched_paths = {
        _normalize_path(r.get("file_path", ""))
        for r in filtered.get("matched_reports", [])
        if r.get("file_path")
    }

    if matched_paths:
        out = [d for d in docs if _normalize_path(d.get("file_path", "")) in matched_paths]
        logger.info(
            "QR name filter [%s/%s]: %d → %d docs after filtering.",
            profile_id, folder_type, len(docs), len(out),
        )
        return out if out else docs  # If normalization mismatch filtered everything, fall back

    if filtered.get("mismatched_count", 0) > 0:
        logger.warning(
            "QR name filter [%s/%s]: all %d processed docs belonged to a different patient.",
            profile_id, folder_type, filtered.get("mismatched_count", 0),
        )
        return []

    return docs  # All unknown names — allow all docs to avoid false negatives


def _compress_context_chunks(
    chunks: list[dict],
    max_chunks: int = 40,
    max_chars_per_chunk: int = 1200,
) -> str:
    """Format retrieved chunks into a single context string for the LLM."""
    blocks: list[str] = []
    for i, c in enumerate(chunks[:max_chunks], 1):
        text = (c.get("text") or "").strip()
        if not text:
            continue
        if len(text) > max_chars_per_chunk:
            text = text[:max_chars_per_chunk].rstrip() + " ..."
        blocks.append(
            f"Excerpt {i} (doc={c.get('doc_id', 'N/A')}, score={c.get('score', 0.0):.3f}):\n{text}"
        )
    return "\n\n".join(blocks)


def _postprocess_summary(summary: str) -> str:
    """Strip markdown headings, JSON artefacts, and collapse blank lines."""
    if not summary:
        return ""

    cleaned: list[str] = []
    for line in summary.splitlines():
        l = line.strip()
        if not l:
            cleaned.append("")
            continue
        # Drop lines that are purely JSON/bracket noise
        if l.startswith("{") or l.startswith("}") or l.startswith("[") or l.startswith("]"):
            continue
        # Drop markdown headings
        if l.startswith("##") or l.startswith("###"):
            continue
        cleaned.append(line.rstrip())

    # Collapse multiple consecutive blank lines to one
    out: list[str] = []
    prev_blank = False
    for line in cleaned:
        is_blank = not line.strip()
        if is_blank and prev_blank:
            continue
        out.append(line)
        prev_blank = is_blank

    return "\n".join(out).strip()


def _summary_payload(
    summary_text: str,
    timestamp_field: str,
    timestamp_value: Optional[str] = None,
    **extra,
) -> dict:
    """Build a minimal in-memory summary dict (used when DB save succeeds but re-fetch fails)."""
    payload = {
        "summary_text": summary_text,
        timestamp_field: timestamp_value or datetime.now(timezone.utc).isoformat(),
    }
    payload.update(extra)
    return payload


# ─────────────────────────────────────────────────────────────────────────────
# Medical SOS summary
# ─────────────────────────────────────────────────────────────────────────────

def generate_medical_sos_summary(
    profile_id: str,
    user_name: str,
    context_chunks: list[dict],
) -> str:
    """
    Generate a plain-text emergency medical summary from retrieved document chunks.
    Intended to be scanned by a doctor in an SOS situation — only clinically
    actionable information is included.
    """
    call_llm = _load_modules()["call_llm"]
    context = _compress_context_chunks(context_chunks)

    system_prompt = (
        "You are a clinical documentation assistant generating emergency medical summaries "
        "for first responders and treating physicians. Your output is plain text only — "
        "no markdown headings, no JSON, no curly braces, no bullet symbols. "
        "Every line must be a direct factual statement drawn from the provided excerpts. "
        "If a section has no supporting evidence in the excerpts, write exactly: Not documented."
    )

    user_prompt = f"""
Task: Prepare a plain-text emergency medical summary using ONLY the excerpts below.
Patient identity filter: include information only from documents that belong to the patient named "{user_name}". If a document appears to belong to a different person, ignore it entirely.

Output format rules:
- Plain text only. No markdown (#, **, -, *). No JSON. No curly or square brackets.
- Do NOT include the patient's name, date of birth, address, or ID numbers.
- Write each section label followed by a colon, then the content on the same or next line.
- If evidence is absent for a section, write exactly: Not documented.
- Be specific: include test values, units, reference ranges, medication doses, and dates wherever the excerpts contain them.
- Flag life-threatening or high-priority items with the word CRITICAL in caps.

Write these sections in order:

CRITICAL ALERTS:
(Life-threatening allergies, contraindicated drugs, critical lab values, implanted devices that affect treatment — e.g. pacemaker, cochlear implant)

ACTIVE DIAGNOSES:
(Current confirmed medical conditions with onset dates if documented)

ESSENTIAL MEDICATIONS:
(Name, dose, frequency, route for each active medication. Include reason if documented)

RECENT LAB AND DIAGNOSTIC FINDINGS:
(Test name, result value with units, reference range, date, and whether the value is normal or abnormal. Group by test date if multiple dates present)

PAST SURGERIES AND PROCEDURES:
(Procedure name, date, hospital or surgeon if documented)

IMPLANTS AND DEVICES:
(Type, model/brand if available, implantation date)

ALLERGIES AND ADVERSE REACTIONS:
(Allergen, type of reaction, severity)

CHRONIC CONDITIONS UNDER MANAGEMENT:
(Condition, treating doctor, current status)

FAMILY HISTORY RELEVANT TO EMERGENCIES:
(Hereditary conditions that affect emergency treatment decisions)

MISSING OR INCOMPLETE CRITICAL DATA:
(List any sections above where key information appears to be absent from the uploaded documents)

Document Excerpts:
{context}
""".strip()

    summary = call_llm(system_prompt=system_prompt, user_prompt=user_prompt, max_tokens=2200)
    return _postprocess_summary(summary)


# ─────────────────────────────────────────────────────────────────────────────
# Insurance priority summary
# ─────────────────────────────────────────────────────────────────────────────

def generate_insurance_priority_summary(
    profile_id: str,
    user_name: str,
    context_chunks: list[dict],
) -> str:
    """
    Generate a plain-text insurance priority summary from retrieved document chunks.
    All fields required by the original spec are covered.
    """
    call_llm = _load_modules()["call_llm"]
    context = _compress_context_chunks(context_chunks)

    system_prompt = (
        "You are an insurance documentation assistant. Your output is plain text only — "
        "no markdown headings, no JSON, no curly braces. "
        "Every value must come directly from the provided excerpts. "
        "If a field is absent from the excerpts, write exactly: Not documented."
    )

    user_prompt = f"""
Task: Prepare a plain-text insurance summary using ONLY the excerpts below.
Policy holder filter: include information only from documents that belong to the policy holder named "{user_name}". Ignore content that clearly belongs to a different person.

Output format rules:
- Plain text only. No markdown (#, **, -, *). No JSON.
- Write each field label followed by a colon and the value on the same line.
- If a field is not found in the excerpts, write: Not documented.
- Do NOT include the policy holder's name, date of birth, or personal ID numbers.

Write these fields in order:

POLICY OVERVIEW

Insurer Name:
Policy Number:
Plan Name:
Policy Type:
Insured Members:
Policy Status:
Policy Start Date:
Policy End Date:

COVERAGE DETAILS

Total Sum Insured:
Remaining Coverage:
Coverage Used:
Room Rent Limit:
ICU Coverage:
Pre-Hospitalization Coverage:
Post-Hospitalization Coverage:
Day Care Procedures Covered:

MEDICAL RULES

Pre-Existing Disease Waiting Period:
Specific Disease Waiting Period:
Maternity Waiting Period:
Covered Conditions:
Excluded Conditions:

HOSPITAL ACCESS

Cashless Facility Available:
TPA Name:
TPA Helpline:

CLAIM PROCESS

Claim Initiation Steps:
Pre-Authorization Requirements:
Mandatory Documents for Claim:
Reimbursement Timelines:
Emergency Cashless Activation:

CONTACTS AND ESCALATION

Insurer Customer Care:
Grievance Contact:
Nearest Network Hospital Information:

IMPORTANT EXCLUSIONS AND LIMITS:
(List the most critical exclusions and financial sub-limits from the documents)

Document Excerpts:
{context}
""".strip()

    summary = call_llm(system_prompt=system_prompt, user_prompt=user_prompt, max_tokens=2200)
    return _postprocess_summary(summary)


# ─────────────────────────────────────────────────────────────────────────────
# Medical QR summary orchestration
# ─────────────────────────────────────────────────────────────────────────────

def ensure_medical_qr_summary(profile_id: str, user_name: str) -> Optional[dict]:
    """
    Ensure an up-to-date medical SOS summary exists for profile_id.

    Returns the DB cache row dict on success, or None if no documents are found.
    Uses ``qr_index_manager`` with ``QR_MEDICAL_VECTOR_DIR`` so it never interferes
    with the interactive lab-report query index.
    """
    mods = _load_modules()
    sb               = mods["sb"]
    update_index     = mods["update_index"]
    get_docs_delta   = mods["get_docs_delta"]
    search_index     = mods["search_index"]
    invalidate_index = mods["invalidate_index"]

    profile_id = str(profile_id).strip()

    all_docs = _build_docs(profile_id, folder_type="reports")
    docs = _filter_docs_by_user_name(profile_id, "reports", all_docs, user_name)

    if not docs:
        # No documents — clear any stale cache and index
        try:
            sb.clear_user_cache(profile_id, folder_type="reports")
            invalidate_index(profile_id, QR_MEDICAL_VECTOR_DIR)
        except Exception:
            pass
        return None

    signature = _compute_docs_signature(docs)

    # ── Fast path: valid cache already exists and documents haven't changed ──
    cached = sb.get_cached_summary(
        profile_id,
        folder_type="reports",
        expected_signature=signature,
    )
    try:
        to_add, to_remove = get_docs_delta(profile_id, docs, QR_MEDICAL_VECTOR_DIR)
    except Exception:
        to_add, to_remove = docs, []

    docs_changed = bool(to_add or to_remove)

    if cached and cached.get("summary_text") and not docs_changed:
        logger.info("Medical QR cache hit for profile %s.", profile_id)
        return cached

    # Documents changed — invalidate stale cache
    if docs_changed:
        try:
            sb.clear_user_cache(profile_id, folder_type="reports")
        except Exception:
            pass

    # ── Download only new/changed documents ──────────────────────────────────
    file_paths: dict[str, str] = {}
    temp_files: list[str] = []
    if to_add:
        file_paths = _concurrent_download(to_add, sb.get_file_bytes)
        temp_files = list(file_paths.values())

    # ── Build/update the QR-specific FAISS index ─────────────────────────────
    with _temp_file_context(temp_files):
        index, chunks_dict, vectorizer = update_index(
            profile_id=profile_id,
            docs=docs,
            file_paths=file_paths,
            vector_dir=QR_MEDICAL_VECTOR_DIR,
        )

    # ── Retrieve relevant chunks and generate summary ────────────────────────
    top_k = min(max(20, index.ntotal), 60)
    context_chunks = search_index(
        index=index,
        chunks_dict=chunks_dict,
        vectorizer=vectorizer,
        query=_MEDICAL_RETRIEVAL_QUERY,
        top_k=top_k,
        min_score=0.0,
    )

    # Fallback: if search returns nothing, use all chunks
    if not context_chunks:
        context_chunks = [
            {"text": c.get("text", ""), "doc_id": c.get("doc_id", "N/A"), "score": 0.0}
            for _, c in list(chunks_dict.items())[:30]
            if isinstance(c, dict)
        ]

    summary_text = generate_medical_sos_summary(profile_id, user_name, context_chunks)
    if not summary_text:
        logger.warning("Medical QR summary generation returned empty for profile %s.", profile_id)
        return None

    # ── Persist to DB ────────────────────────────────────────────────────────
    try:
        sb.save_summary_cache(
            profile_id=profile_id,
            folder_type="reports",
            summary=summary_text,
            report_count=len(docs),
            reports_signature=signature,
        )
        saved = sb.get_cached_summary(profile_id, "reports", signature)
        if saved and saved.get("summary_text"):
            logger.info("Medical QR summary saved and verified for profile %s.", profile_id)
            return saved
    except Exception as exc:
        logger.warning("Medical QR cache persist failed for profile %s: %s", profile_id, exc)

    # DB save failed — return an in-memory payload so the caller can still display it
    return _summary_payload(
        summary_text,
        "generated_at",
        folder_type="reports",
        reports_signature=signature,
        report_count=len(docs),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Insurance QR summary orchestration
# ─────────────────────────────────────────────────────────────────────────────

def ensure_insurance_qr_summary(profile_id: str, user_name: str) -> Optional[dict]:
    """
    Ensure an up-to-date insurance priority summary exists for profile_id.

    Returns the DB cache row dict on success, or None if no documents are found.
    Uses ``qr_index_manager`` with ``QR_INSURANCE_VECTOR_DIR``.
    """
    mods = _load_modules()
    sb               = mods["sb"]
    update_index     = mods["update_index"]
    get_docs_delta   = mods["get_docs_delta"]
    search_index     = mods["search_index"]
    invalidate_index = mods["invalidate_index"]

    profile_id = str(profile_id).strip()

    all_docs = _build_docs(profile_id, folder_type="insurance")
    docs = _filter_docs_by_user_name(profile_id, "insurance", all_docs, user_name)

    if not docs:
        try:
            sb.clear_insurance_cache(profile_id)
            invalidate_index(profile_id, QR_INSURANCE_VECTOR_DIR)
        except Exception:
            pass
        return None

    signature = _compute_docs_signature(docs)

    # ── Fast path: valid cache already exists and documents haven't changed ──
    cached = sb.get_cached_insurance_summary(
        profile_id, expected_signature=signature,
    )
    try:
        to_add, to_remove = get_docs_delta(profile_id, docs, QR_INSURANCE_VECTOR_DIR)
    except Exception:
        to_add, to_remove = docs, []

    docs_changed = bool(to_add or to_remove)

    if cached and cached.get("summary_text") and not docs_changed:
        logger.info("Insurance QR cache hit for profile %s.", profile_id)
        return cached

    if docs_changed:
        try:
            sb.clear_insurance_cache(profile_id)
        except Exception:
            pass

    # ── Download only new/changed documents ──────────────────────────────────
    file_paths: dict[str, str] = {}
    temp_files: list[str] = []
    if to_add:
        file_paths = _concurrent_download(to_add, sb.get_file_bytes)
        temp_files = list(file_paths.values())

    # ── Build/update the QR-specific FAISS index ─────────────────────────────
    with _temp_file_context(temp_files):
        index, chunks_dict, vectorizer = update_index(
            profile_id=profile_id,
            docs=docs,
            file_paths=file_paths,
            vector_dir=QR_INSURANCE_VECTOR_DIR,
        )

    # ── Retrieve relevant chunks and generate summary ────────────────────────
    top_k = min(max(20, index.ntotal), 60)
    context_chunks = search_index(
        index=index,
        chunks_dict=chunks_dict,
        vectorizer=vectorizer,
        query=_INSURANCE_RETRIEVAL_QUERY,
        top_k=top_k,
        min_score=0.0,
    )

    if not context_chunks:
        context_chunks = [
            {"text": c.get("text", ""), "doc_id": c.get("doc_id", "N/A"), "score": 0.0}
            for _, c in list(chunks_dict.items())[:30]
            if isinstance(c, dict)
        ]

    summary_text = generate_insurance_priority_summary(profile_id, user_name, context_chunks)
    if not summary_text:
        logger.warning("Insurance QR summary generation returned empty for profile %s.", profile_id)
        return None

    # ── Persist to DB ────────────────────────────────────────────────────────
    try:
        sb.save_insurance_summary_cache(
            profile_id=profile_id,
            summary=summary_text,
            report_count=len(docs),
            reports_signature=signature,
            report_type="insurance",
        )
        saved = sb.get_cached_insurance_summary(profile_id, expected_signature=signature)
        if saved and saved.get("summary_text"):
            logger.info("Insurance QR summary saved and verified for profile %s.", profile_id)
            return saved
    except Exception as exc:
        logger.warning("Insurance QR cache persist failed for profile %s: %s", profile_id, exc)

    return _summary_payload(
        summary_text,
        "created_at",
        reports_signature=signature,
        report_count=len(docs),
        report_type="insurance",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public entry point called by all_users_data.py
# ─────────────────────────────────────────────────────────────────────────────

def ensure_qr_summaries(profile_id: str) -> dict:
    """
    Ensure both QR summaries are current for profile_id.

    Returns a dict with keys "medical_summary" and "insurance_summary".
    Each value is either a DB row dict (with summary_text) or None.
    """
    pid = str(profile_id).strip()
    user_name = _resolve_user_name(pid)

    medical_summary: Optional[dict] = None
    insurance_summary: Optional[dict] = None

    try:
        medical_summary = ensure_medical_qr_summary(pid, user_name=user_name)
    except Exception as exc:
        logger.exception("Medical QR summary failed for profile %s: %s", pid, exc)

    try:
        insurance_summary = ensure_insurance_qr_summary(pid, user_name=user_name)
    except Exception as exc:
        logger.exception("Insurance QR summary failed for profile %s: %s", pid, exc)

    return {
        "medical_summary":   medical_summary,
        "insurance_summary": insurance_summary,
    }