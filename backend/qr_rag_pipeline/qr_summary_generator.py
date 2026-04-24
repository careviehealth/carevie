"""
qr_summary_generator.py
========================
On-demand RAG summary generation for the QR Emergency Profile pipeline.

Two public functions:
    generate_medical_summary(profile_id)  → pure text summary
    generate_insurance_summary(profile_id) → strict JSON string

Both functions:
  1. List current storage files for the profile.
  2. Compute delta (new/changed/deleted) against the existing vector manifest.
  3. Download ONLY changed documents (concurrent, temp files).
  4. Incrementally update the shared FAISS vector index.
  5. Run RAG retrieval + LLM generation with emergency-grade prompts.
  6. Cache the result to the DB summary table.

Vector indexes are SHARED with the existing labreport_summary and
insurance_summary pipelines.  This module imports and calls the same
``update_*_index()`` and ``search_index()`` functions — no new vectors.
"""

from __future__ import annotations

import concurrent.futures
import json
import logging
import os
import sys
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

_MAX_DOWNLOAD_WORKERS: int = int(os.getenv("QR_DOWNLOAD_WORKERS", "4"))

# Higher top_k and token budget for emergency summaries (need exhaustive coverage)
_MEDICAL_TOP_K:     int = 15
_MEDICAL_MAX_TOKENS: int = 2500
_INSURANCE_TOP_K:    int = 15
_INSURANCE_MAX_TOKENS: int = 2000


# ─────────────────────────────────────────────────────────────────────────────
# Temp-file download helpers (inlined — same pattern as lab_report_handler)
# ─────────────────────────────────────────────────────────────────────────────

def _download_one(doc: dict, get_file_bytes_fn) -> tuple[str, str]:
    """Download a single document to a named temp file on disk."""
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
    """Unconditionally remove all temp files on exit."""
    try:
        yield
    finally:
        for path in temp_paths:
            try:
                os.unlink(path)
            except OSError:
                pass


def _concurrent_download(
    docs_to_fetch: list[dict],
    get_file_bytes_fn,
) -> dict[str, str]:
    """Download docs in parallel. Returns {logical_path: temp_path}."""
    file_paths: dict[str, str] = {}
    if not docs_to_fetch:
        return file_paths

    workers = min(_MAX_DOWNLOAD_WORKERS, len(docs_to_fetch))
    logger.info("Downloading %d file(s) with %d worker(s)…", len(docs_to_fetch), workers)

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
                logger.error("Failed to download '%s': %s", doc.get("file_name"), exc)

    logger.info("Download complete: %d/%d succeeded.", len(file_paths), len(docs_to_fetch))
    return file_paths


# ─────────────────────────────────────────────────────────────────────────────
# Doc metadata builder (same pattern as lab_report_handler / insurance_handler)
# ─────────────────────────────────────────────────────────────────────────────

def _build_doc_list(
    profile_id: str,
    storage_files: list[dict],
    folder_type: str,
) -> list[dict]:
    """Convert raw storage file listings into the doc-metadata format
    expected by get_docs_delta / update_*_index."""
    docs: list[dict] = []
    for f in storage_files:
        file_name = (f.get("name") or "").strip()
        if not file_name:
            continue
        file_path = f"{profile_id}/{folder_type}/{file_name}".replace("//", "/")
        docs.append({
            "id":               file_path,
            "file_path":        file_path,
            "file_name":        file_name,
            "extracted_text":   "",
            "source_file_hash": (
                (f.get("metadata") or {}).get("etag")
                if isinstance(f.get("metadata"), dict)
                else ""
            ),
        })
    return docs


# ─────────────────────────────────────────────────────────────────────────────
# Public: Generate Medical Summary
# ─────────────────────────────────────────────────────────────────────────────

def generate_medical_summary(profile_id: str) -> str:
    """
    Generate an emergency-grade medical summary via the lab report RAG pipeline.

    Returns pure text (the summary string).  The result is also cached to
    ``medical_summaries_cache`` so subsequent calls hit the fast path.

    Raises on critical failure so the SSE orchestrator can handle it.
    """
    from supabase_helper import (
        list_user_files,
        get_file_bytes,
        get_profile_info,
        compute_signature_from_docs,
        save_summary_cache,
    )
    from labreport_summary.lab_report_rag import (
        update_lab_report_index,
        search_index,
        get_docs_delta,
    )
    from rag_pipeline.rag_query import call_llm
    from qr_rag_pipeline.prompts import (
        EMERGENCY_MEDICAL_SUMMARY_SYSTEM,
        EMERGENCY_MEDICAL_SUMMARY_USER,
        EMERGENCY_RAG_QUERY,
    )

    log_prefix = f"[qr_medical_summary | profile={profile_id}]"
    logger.info("%s Starting medical summary generation.", log_prefix)

    # 1. List current storage files
    storage_files = list_user_files(profile_id, folder_type="reports") or []
    if not storage_files:
        logger.info("%s No report files in storage.", log_prefix)
        return "No lab report files found. Please upload your medical reports."

    # 2. Build doc metadata
    docs = _build_doc_list(profile_id, storage_files, "reports")
    if not docs:
        return "No processable lab report files found."

    # 3. Delta check — download only changed docs
    try:
        to_add, _to_remove = get_docs_delta(profile_id, docs)
    except Exception as exc:
        logger.warning("%s get_docs_delta failed (%s); full fetch.", log_prefix, exc)
        to_add = docs

    # 4. Concurrent download to temp files
    file_paths: dict[str, str] = {}
    temp_files: list[str] = []

    if to_add:
        file_paths = _concurrent_download(to_add, get_file_bytes)
        temp_files = list(file_paths.values())
    else:
        logger.info("%s All documents unchanged. No downloads required.", log_prefix)

    with _temp_file_context(temp_files):
        # 5. Incremental vector update (shared index)
        index, chunks_dict, vectorizer = update_lab_report_index(
            profile_id, docs, file_paths
        )

        # 6. RAG retrieval with comprehensive emergency query
        context_chunks = search_index(
            index, chunks_dict, vectorizer,
            query=EMERGENCY_RAG_QUERY,
            top_k=_MEDICAL_TOP_K,
            min_score=0.18,  # slightly lower threshold for exhaustive coverage
        )

        if not context_chunks:
            return (
                "Lab reports were indexed but no relevant content could be "
                "retrieved. The documents may contain non-extractable content."
            )

        # 7. Build LLM prompt
        excerpts = "\n\n".join(
            f"[Excerpt {i} | doc_id={c.get('doc_id', 'N/A')} | "
            f"relevance={c.get('score', 0.0):.3f}]\n{c['text']}"
            for i, c in enumerate(context_chunks, 1)
        )
        user_prompt = EMERGENCY_MEDICAL_SUMMARY_USER.format(excerpts=excerpts)

        logger.info("%s Generating summary from %d chunks.", log_prefix, len(context_chunks))

        summary: str = call_llm(
            system_prompt=EMERGENCY_MEDICAL_SUMMARY_SYSTEM,
            user_prompt=user_prompt,
            max_tokens=_MEDICAL_MAX_TOKENS,
        )

    # 8. Cache the result
    current_sig = compute_signature_from_docs(docs)
    try:
        save_summary_cache(
            profile_id=profile_id,
            folder_type="reports",
            summary=summary,
            report_count=len(docs),
            reports_signature=current_sig,
        )
        logger.info("%s Summary cached (%d chars).", log_prefix, len(summary))
    except Exception as exc:
        logger.warning("%s Cache save failed: %s", log_prefix, exc)

    return summary


# ─────────────────────────────────────────────────────────────────────────────
# Public: Generate Insurance Summary
# ─────────────────────────────────────────────────────────────────────────────

_INSURANCE_DEFAULT = {
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


def _parse_insurance_json(raw_text: str) -> dict:
    """
    Parse the LLM's JSON output, stripping markdown fences if present.
    Falls back to the default schema on parse failure.
    """
    cleaned = raw_text.strip()

    # Strip markdown code fences
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to find JSON object within the text
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                parsed = json.loads(cleaned[start:end + 1])
            except json.JSONDecodeError:
                logger.warning("Failed to parse insurance JSON from LLM output.")
                return dict(_INSURANCE_DEFAULT)
        else:
            logger.warning("No JSON object found in insurance LLM output.")
            return dict(_INSURANCE_DEFAULT)

    # Merge with defaults to guarantee all keys exist
    result = {}
    for section, defaults in _INSURANCE_DEFAULT.items():
        if isinstance(defaults, dict):
            result[section] = {**defaults, **(parsed.get(section) or {})}
        else:
            result[section] = parsed.get(section, defaults)

    return result


def generate_insurance_summary(profile_id: str) -> dict:
    """
    Generate a structured insurance summary via the insurance RAG pipeline.

    Returns a dict with the exact policy schema (policy_overview,
    coverage_details, medical_rules, hospital_access).  The JSON-stringified
    result is also cached to ``insurance_summary_cache``.

    Raises on critical failure so the SSE orchestrator can handle it.
    """
    from supabase_helper import (
        list_user_files,
        get_file_bytes,
        compute_signature_from_docs,
        save_insurance_summary_cache,
    )
    from insurance_summary.insurance_rag_query import (
        update_insurance_index,
        search_index,
        get_docs_delta,
    )
    from rag_pipeline.rag_query import call_llm
    from qr_rag_pipeline.prompts import (
        INSURANCE_STRUCTURED_SYSTEM,
        INSURANCE_STRUCTURED_USER,
        INSURANCE_RAG_QUERY,
    )

    log_prefix = f"[qr_insurance_summary | profile={profile_id}]"
    logger.info("%s Starting insurance summary generation.", log_prefix)

    # 1. List current storage files
    storage_files = list_user_files(profile_id, folder_type="insurance") or []
    if not storage_files:
        logger.info("%s No insurance files in storage.", log_prefix)
        return dict(_INSURANCE_DEFAULT)

    # 2. Build doc metadata
    docs = _build_doc_list(profile_id, storage_files, "insurance")
    if not docs:
        return dict(_INSURANCE_DEFAULT)

    # 3. Delta check
    try:
        to_add, _to_remove = get_docs_delta(profile_id, docs)
    except Exception as exc:
        logger.warning("%s get_docs_delta failed (%s); full fetch.", log_prefix, exc)
        to_add = docs

    # 4. Download changed docs
    file_paths: dict[str, str] = {}
    temp_files: list[str] = []

    if to_add:
        file_paths = _concurrent_download(to_add, get_file_bytes)
        temp_files = list(file_paths.values())

    with _temp_file_context(temp_files):
        # 5. Incremental vector update (shared index)
        index, chunks_dict, vectorizer = update_insurance_index(
            profile_id, docs, file_paths
        )

        # 6. RAG retrieval
        context_chunks = search_index(
            index, chunks_dict, vectorizer,
            query=INSURANCE_RAG_QUERY,
            top_k=_INSURANCE_TOP_K,
            min_score=0.18,
        )

        if not context_chunks:
            return dict(_INSURANCE_DEFAULT)

        # 7. Build LLM prompt
        excerpts = "\n\n".join(
            f"[Excerpt {i} | doc_id={c.get('doc_id', 'N/A')} | "
            f"relevance={c.get('score', 0.0):.3f}]\n{c['text']}"
            for i, c in enumerate(context_chunks, 1)
        )
        user_prompt = INSURANCE_STRUCTURED_USER.format(excerpts=excerpts)

        logger.info(
            "%s Generating insurance extraction from %d chunks.",
            log_prefix, len(context_chunks),
        )

        raw_output: str = call_llm(
            system_prompt=INSURANCE_STRUCTURED_SYSTEM,
            user_prompt=user_prompt,
            max_tokens=_INSURANCE_MAX_TOKENS,
        )

    # 8. Parse JSON
    result = _parse_insurance_json(raw_output)

    # 9. Cache
    current_sig = compute_signature_from_docs(docs)
    try:
        save_insurance_summary_cache(
            profile_id=profile_id,
            summary=json.dumps(result, ensure_ascii=False),
            report_count=len(docs),
            reports_signature=current_sig,
            report_type="insurance",
        )
        logger.info("%s Insurance summary cached.", log_prefix)
    except Exception as exc:
        logger.warning("%s Insurance cache save failed: %s", log_prefix, exc)

    return result
