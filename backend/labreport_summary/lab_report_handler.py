"""
lab_report_handler.py
=====================
Lab Report Intent Handler — entry point called by ``intent_detector.py``.

Public API
----------
    handle_lab_report_query(profile_id: str, user_question: str) -> dict

Return contract
---------------
Success:
    {"success": True,  "message": "<LLM answer>"}

Handled error (safe to display to the user):
    {"success": False, "message": "<user-friendly error string>"}

Design decisions
----------------
* **Cached imports** — ``_load_modules()`` wraps all heavy dependencies in
  ``@lru_cache(maxsize=1)``.  The ImportError surface is hit only on the
  very first request; every subsequent call (including concurrent ones) pays
  zero import overhead.

* **Incremental delta check** — ``get_docs_delta()`` (from lab_report_rag)
  returns only the documents that are new or have changed.  The handler
  downloads *only those files*, not the entire vault on every query.

* **Concurrent downloads to temp files** — files are fetched in parallel via
  ``ThreadPoolExecutor`` and written straight to ``tempfile.NamedTemporaryFile``
  objects on disk.  Raw bytes are never held in the Python heap longer than
  needed for a single write, eliminating the OOM risk from in-memory approaches.
  A ``_temp_file_context`` context manager guarantees all temp files are removed
  after the RAG pipeline returns, even on exception.
"""

from __future__ import annotations

import concurrent.futures
import logging
import os
import sys
import tempfile
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Iterator

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Maximum parallel download workers (tune via env var for your infra)
_MAX_DOWNLOAD_WORKERS: int = int(os.getenv("LAB_REPORT_DOWNLOAD_WORKERS", "4"))


# ─────────────────────────────────────────────────────────────────────────────
# Cached module loader
# ─────────────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_modules() -> dict:
    """
    Import all runtime dependencies once and cache them for the lifetime of
    the process.  ``lru_cache(maxsize=1)`` means:

      • The first call pays the full import cost and may raise ``ImportError``.
      • Every subsequent call (even from many concurrent request threads)
        returns the cached dict instantly with zero I/O.
      • There is no module-level import that could crash the process at startup
        if an optional dependency is missing.
    """
    from supabase_helper import list_user_files, get_file_bytes, get_profile_info
    from labreport_summary.lab_report_rag import run_lab_report_rag, get_docs_delta

    return {
        "list_user_files":      list_user_files,
        "get_file_bytes":       get_file_bytes,
        "get_profile_info":     get_profile_info,
        "run_lab_report_rag":   run_lab_report_rag,
        "get_docs_delta":       get_docs_delta,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Temp-file download helpers
# ─────────────────────────────────────────────────────────────────────────────

def _download_one(
    doc: dict,
    get_file_bytes_fn,
) -> tuple[str, str]:
    """
    Download a single document to a named temp file on disk.

    Streams raw bytes from ``get_file_bytes_fn`` directly into the file,
    so at most one document's worth of bytes lives in memory at any time
    per thread.

    Returns
    -------
    (logical_file_path, temp_file_path)
        The caller maps logical → temp so the RAG pipeline can open the file
        by its logical path key.

    Notes
    -----
    The temp file is NOT deleted here.  The caller is responsible for cleanup
    via ``_temp_file_context``.
    """
    logical_path: str = doc["file_path"]
    ext: str = os.path.splitext(doc.get("file_name", ""))[-1] or ".pdf"

    raw_bytes: bytes = get_file_bytes_fn(logical_path)

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        tmp.write(raw_bytes)
    finally:
        tmp.close()

    logger.debug(
        "Downloaded '%s' → temp '%s' (%d bytes)",
        logical_path, tmp.name, len(raw_bytes),
    )
    return logical_path, tmp.name


@contextmanager
def _temp_file_context(temp_paths: list[str]) -> Iterator[None]:
    """
    Context manager that unconditionally removes every path in *temp_paths*
    on exit, whether the block succeeded or raised.
    """
    try:
        yield
    finally:
        for path in temp_paths:
            try:
                os.unlink(path)
                logger.debug("Deleted temp file: %s", path)
            except OSError:
                pass  # Already gone or permission issue — not fatal


def _concurrent_download(
    docs_to_fetch: list[dict],
    get_file_bytes_fn,
) -> dict[str, str]:
    """
    Download *docs_to_fetch* in parallel.

    Parameters
    ----------
    docs_to_fetch:
        Document metadata dicts (must contain ``file_path`` and ``file_name``).
    get_file_bytes_fn:
        Callable that accepts a logical file path and returns raw bytes.

    Returns
    -------
    dict[logical_file_path, temp_file_path]
        Only successfully downloaded documents appear in the result.
        Failed downloads are logged at ERROR level and silently skipped so
        that the pipeline can still use any documents that did succeed.
    """
    file_paths: dict[str, str] = {}

    if not docs_to_fetch:
        return file_paths

    workers = min(_MAX_DOWNLOAD_WORKERS, len(docs_to_fetch))
    logger.info(
        "Downloading %d file(s) with up to %d worker(s)…",
        len(docs_to_fetch), workers,
    )

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
                logger.error(
                    "Failed to download '%s': %s",
                    doc.get("file_name"), exc,
                )

    logger.info(
        "Concurrent download complete: %d/%d succeeded.",
        len(file_paths), len(docs_to_fetch),
    )
    return file_paths


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

def handle_lab_report_query(profile_id: str, user_question: str) -> dict:
    """
    Orchestrate the lab report RAG pipeline for a single user query.

    Parameters
    ----------
    profile_id:
        Supabase profile UUID (string or UUID object).
    user_question:
        Raw question text from the user.

    Returns
    -------
    dict
        ``{"success": True,  "message": "<answer>"}``  on success.
        ``{"success": False, "message": "<error>"}``   on any handled failure.
    """
    log_prefix = f"[lab_report_handler | profile={profile_id}]"
    logger.info("%s Received query: %.120s", log_prefix, user_question)

    # ── Input validation ──────────────────────────────────────────────────────

    if not profile_id or not str(profile_id).strip():
        logger.error("%s profile_id is empty or None", log_prefix)
        return {
            "success": False,
            "message": (
                "An internal error occurred: the profile identifier is missing. "
                "Please refresh and try again."
            ),
        }

    if not user_question or not user_question.strip():
        logger.warning("%s Received empty user_question", log_prefix)
        return {
            "success": False,
            "message": "Please type a question about your lab reports.",
        }

    profile_id    = str(profile_id).strip()
    user_question = user_question.strip()

    # ── Load modules (free after first call) ─────────────────────────────────

    try:
        mods = _load_modules()
    except ImportError as exc:
        logger.critical(
            "%s Critical import failure: %s", log_prefix, exc, exc_info=True
        )
        return {
            "success": False,
            "message": (
                "An internal configuration error occurred. "
                "Please contact support if this persists."
            ),
        }

    list_user_files    = mods["list_user_files"]
    get_file_bytes     = mods["get_file_bytes"]
    get_profile_info   = mods["get_profile_info"]
    run_lab_report_rag = mods["run_lab_report_rag"]
    get_docs_delta     = mods["get_docs_delta"]

    # ── Fetch user display name ───────────────────────────────────────────────

    user_name = "the user"
    try:
        info = get_profile_info(profile_id)
        if info:
            user_name = info.get("display_name") or info.get("name") or "the user"
            logger.info("%s User name resolved: %s", log_prefix, user_name)
    except Exception as exc:
        logger.warning("%s Failed to fetch profile info: %s", log_prefix, exc)

    # ── List storage files ────────────────────────────────────────────────────

    try:
        storage_files = list_user_files(profile_id, folder_type="reports") or []
    except Exception as exc:
        logger.error(
            "%s Failed to list storage files: %s", log_prefix, exc, exc_info=True
        )
        return {
            "success": False,
            "message": (
                "I was unable to retrieve your lab report files at this time. "
                "Please try again in a moment."
            ),
        }

    if not storage_files:
        return {
            "success": False,
            "message": (
                "No lab report files were found for your profile. "
                "Please upload your lab reports, blood tests, or diagnostic documents "
                "to the Reports folder of your Vault, then try again."
            ),
        }

    # ── Build doc metadata list ───────────────────────────────────────────────

    docs: list[dict] = []
    for f in storage_files:
        file_name = (f.get("name") or "").strip()
        if not file_name:
            continue
        file_path = f"{profile_id}/reports/{file_name}".replace("//", "/")
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

    if not docs:
        return {
            "success": False,
            "message": (
                "I found lab report files, but none could be prepared for processing."
            ),
        }

    # ── Incremental delta check — download only what actually changed ─────────
    # get_docs_delta compares each doc's per-file signature against the stored
    # manifest and returns only the subset that needs (re-)embedding.  Unchanged
    # documents are skipped entirely: no download, no OCR, no re-embedding.

    try:
        to_add, _to_remove = get_docs_delta(profile_id, docs)
    except Exception as exc:
        logger.warning(
            "%s get_docs_delta failed (%s); falling back to full fetch.",
            log_prefix, exc,
        )
        to_add = docs  # Safe fallback: treat everything as new

    # ── Concurrent download to temp files (only new/changed docs) ────────────

    file_paths: dict[str, str] = {}
    temp_files: list[str]       = []

    if to_add:
        file_paths = _concurrent_download(to_add, get_file_bytes)
        temp_files = list(file_paths.values())
    else:
        logger.info(
            "%s All documents unchanged. No downloads required.", log_prefix
        )

    # ── Run RAG pipeline; clean up temp files regardless of outcome ───────────

    with _temp_file_context(temp_files):
        try:
            answer: str = run_lab_report_rag(
                profile_id=profile_id,
                user_question=user_question,
                docs=docs,
                file_paths=file_paths,      # {logical_path: temp_path}
                user_name=user_name,
            )
            return {"success": True, "message": answer}

        except Exception as exc:
            logger.exception(
                "%s Unexpected RAG pipeline error: %s", log_prefix, exc
            )
            return {
                "success": False,
                "message": (
                    "An unexpected error occurred while answering your lab report question. "
                    "Please try again in a moment."
                ),
            }


if __name__ == "__main__":
    import json
    result = handle_lab_report_query(
        profile_id="e18af8f2-9c0e-4a92-b6b5-84e8ad019186",
        user_question="is there any data about my kidney disease or not",
    )
    print(json.dumps(result, indent=2))