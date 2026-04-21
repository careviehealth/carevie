"""
insurance_rag_query.py
======================
Insurance RAG Pipeline — Incremental Vector Index Management & Query Execution.

Responsibilities
----------------
  • Maintain a per-profile FAISS index that is updated *incrementally*.
  • Only re-embed documents that are new or whose content has changed.
  • Delete vectors for documents that have been removed from the vault.
  • Execute cosine-similarity search over indexed insurance chunks.
  • Assemble context window and query OpenAI via the shared ``call_llm``.
  • Expose ``invalidate_index()`` for external callers (upload/delete webhooks).

Storage layout  (relative to project root / INSURANCE_VECTOR_DIR)
------------------------------------------------------------------
  vectors/insurance_vector/{profile_id}/
    ├── index.faiss        ← FAISS IndexIDMap2(IndexFlatIP(384-d)), L2-normalised
    ├── chunks_dict.pkl    ← dict[int, {"text": str, "doc_id": str}]
    ├── vectorizer.pkl     ← SentenceTransformerVectorizer (lazy-loaded model)
    └── manifest.json      ← per-doc signatures & vector-ID ranges
                             {
                               "docs": {
                                 "<file_path>": {
                                   "sig":       "<sha256-fragment>",
                                   "chunk_ids": [0, 1, 2, ...]
                                 }
                               },
                               "next_id": <int>
                             }

Incremental update logic
------------------------
  1. ``get_docs_delta(profile_id, docs)`` computes a per-document fingerprint
     (file_path + etag) and compares it against ``manifest.json``.
     It returns the minimal (to_add, to_remove) sets.

  2. ``update_insurance_index()`` loads the existing FAISS index, removes
     stale vectors via ``IndexIDMap2.remove_ids()``, adds only new embeddings
     with contiguous integer IDs, then re-persists.

  3. If no index exists yet, a full build is performed and stored.

  The handler only downloads documents that appear in ``to_add``, so unchanged
  documents incur zero network, OCR, or embedding cost.
"""

from __future__ import annotations

import gc
import json
import logging
import os
import pickle
import shutil
import sys
from pathlib import Path
from typing import Optional

import faiss
import numpy as np

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from rag_pipeline.clean_chunk import chunk_text_with_metadata, clean_text
from rag_pipeline.embed_store import (
    EMBEDDING_DIM,
    create_vectorizer,
    embed_texts,
    get_embedding_metadata,
)
from rag_pipeline.rag_query import call_llm


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

VECTOR_BASE_DIR: str = os.getenv(
    "INSURANCE_VECTOR_DIR",
    os.path.join("vectors", "insurance_vector"),
)

TOP_K:                int   = int(os.getenv("INSURANCE_RAG_TOP_K", "6"))
MIN_SIMILARITY_SCORE: float = float(os.getenv("INSURANCE_RAG_MIN_SCORE", "0.22"))
CHUNK_MAX_WORDS:      int   = 300
CHUNK_OVERLAP_WORDS:  int   = 50
OPENAI_MAX_TOKENS:    int   = int(os.getenv("INSURANCE_RAG_MAX_TOKENS", "1500"))


# ─────────────────────────────────────────────────────────────────────────────
# Path helpers
# ─────────────────────────────────────────────────────────────────────────────

def _profile_dir(profile_id: str) -> str:
    return os.path.join(VECTOR_BASE_DIR, str(profile_id))

def _manifest_path(profile_id: str) -> str:
    return os.path.join(_profile_dir(profile_id), "manifest.json")


# ─────────────────────────────────────────────────────────────────────────────
# Manifest helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_manifest(profile_id: str) -> dict:
    """
    Load manifest.json for *profile_id*.
    Returns an empty manifest structure if the file is absent or unreadable.
    """
    path = _manifest_path(profile_id)
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
                raw.setdefault("docs", {})
                raw.setdefault("next_id", 0)
                raw.setdefault("embedding", {})
                return raw
    except Exception as exc:
        logger.warning("_load_manifest: failed for profile %s: %s", profile_id, exc)
    return {"docs": {}, "next_id": 0, "embedding": {}}


def _save_manifest(profile_id: str, manifest: dict) -> None:
    """Persist *manifest* to disk atomically via a temp-file rename."""
    profile_path = _profile_dir(profile_id)
    Path(profile_path).mkdir(parents=True, exist_ok=True)
    dest = _manifest_path(profile_id)
    tmp  = dest + ".tmp"
    try:
        manifest["embedding"] = get_embedding_metadata()
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2)
        os.replace(tmp, dest)   # atomic on POSIX; near-atomic on Windows
        logger.debug("_save_manifest: saved for profile %s", profile_id)
    except OSError as exc:
        logger.error("_save_manifest: failed for profile %s: %s", profile_id, exc)
        raise


# ─────────────────────────────────────────────────────────────────────────────
# Per-document fingerprint
# ─────────────────────────────────────────────────────────────────────────────

def _doc_sig(doc: dict) -> str:
    """
    Return a deterministic per-document fingerprint string.
    Incorporates both the logical path and the storage etag / content hash so
    that a re-upload of a same-named file with changed contents is detected.
    """
    return "{path}:{hash}".format(
        path=doc.get("file_path", ""),
        hash=doc.get("source_file_hash") or doc.get("id", ""),
    )


def _manifest_embedding_matches_current(manifest: dict) -> bool:
    current = get_embedding_metadata()
    stored = manifest.get("embedding") or {}
    return (
        stored.get("model_name") == current["model_name"]
        and stored.get("schema_version") == current["schema_version"]
        and int(stored.get("embedding_dim", -1)) == current["embedding_dim"]
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public: delta computation
# ─────────────────────────────────────────────────────────────────────────────

def get_docs_delta(
    profile_id: str,
    docs: list[dict],
) -> tuple[list[dict], list[str]]:
    """
    Compare *docs* (current vault listing) against the stored manifest.

    Returns
    -------
    to_add : list[dict]
        Documents that need (re-)embedding.  Includes:
          • Docs that are brand-new (not in manifest).
          • Docs whose ``_doc_sig`` has changed (re-upload / content change).
    to_remove : list[str]
        Logical file paths whose vectors must be purged from the index.
        Includes:
          • Docs that have been deleted from the vault.
          • Docs that have changed (old vectors removed before new ones added).

    The caller (handler) downloads only ``to_add``; unchanged documents are
    never touched.
    """
    manifest     = _load_manifest(profile_id)
    stored_docs  = manifest.get("docs", {})
    current_paths = {d["file_path"] for d in docs}
    stored_paths  = set(stored_docs.keys())

    # Docs present in manifest but no longer in the vault
    to_remove: list[str] = list(stored_paths - current_paths)

    to_add: list[dict] = []
    for doc in docs:
        fp  = doc["file_path"]
        sig = _doc_sig(doc)
        if fp not in stored_docs or stored_docs[fp]["sig"] != sig:
            to_add.append(doc)
            if fp in stored_docs:
                # Content changed — old vectors will be purged then replaced
                to_remove.append(fp)

    logger.info(
        "get_docs_delta [profile=%s]: %d to_add, %d to_remove, %d unchanged.",
        profile_id,
        len(to_add),
        len(to_remove),
        len(docs) - len(to_add),
    )
    return to_add, to_remove


# ─────────────────────────────────────────────────────────────────────────────
# Index existence check
# ─────────────────────────────────────────────────────────────────────────────

def _index_artifacts_exist(profile_id: str) -> bool:
    """Return True only if all four artefacts are present on disk."""
    p = _profile_dir(profile_id)
    return all(
        os.path.exists(os.path.join(p, fname))
        for fname in ("index.faiss", "chunks_dict.pkl", "vectorizer.pkl", "manifest.json")
    )


# ─────────────────────────────────────────────────────────────────────────────
# Low-level index persistence
# ─────────────────────────────────────────────────────────────────────────────

def _save_index(
    profile_id: str,
    index: faiss.Index,
    chunks_dict: dict[int, dict],
    vectorizer,
) -> None:
    """Persist the FAISS index, chunk dict, and vectorizer to disk."""
    p = _profile_dir(profile_id)
    Path(p).mkdir(parents=True, exist_ok=True)

    faiss.write_index(index, os.path.join(p, "index.faiss"))

    with open(os.path.join(p, "chunks_dict.pkl"), "wb") as fh:
        pickle.dump(chunks_dict, fh)

    with open(os.path.join(p, "vectorizer.pkl"), "wb") as fh:
        pickle.dump(vectorizer, fh)

    logger.info("_save_index: persisted %d vector(s) for profile %s.", index.ntotal, profile_id)


def _load_index(profile_id: str) -> tuple:
    """
    Load FAISS index, chunks dict, and vectorizer from disk.

    Returns
    -------
    (index, chunks_dict, vectorizer)
    """
    p = _profile_dir(profile_id)

    index = faiss.read_index(os.path.join(p, "index.faiss"))
    logger.info("_load_index: %d vector(s) loaded for profile %s.", index.ntotal, profile_id)

    with open(os.path.join(p, "chunks_dict.pkl"), "rb") as fh:
        chunks_dict: dict[int, dict] = pickle.load(fh)

    with open(os.path.join(p, "vectorizer.pkl"), "rb") as fh:
        vectorizer = pickle.load(fh)

    return index, chunks_dict, vectorizer


# ─────────────────────────────────────────────────────────────────────────────
# Text extraction
# ─────────────────────────────────────────────────────────────────────────────

def _extract_text_for_doc(doc: dict, file_paths: dict[str, str]) -> str:
    """
    Return plain text for *doc*.

    Fast path: if ``extracted_text`` is already stored in the DB record, use it
    directly (no I/O).

    Slow path: read raw bytes from the temp file on disk (identified via
    ``file_paths``) and run OCR extraction.  Reading from disk rather than
    an in-memory bytes buffer keeps peak heap usage proportional to a single
    document, not the entire vault.
    """
    from rag_pipeline.extractor_OCR import extract_text_from_bytes

    stored_text = (doc.get("extracted_text") or "").strip()
    if stored_text:
        return stored_text

    file_path: str = doc.get("file_path", "")
    temp_path: Optional[str] = file_paths.get(file_path)

    if not temp_path or not os.path.exists(temp_path):
        logger.warning(
            "_extract_text_for_doc: no temp file for '%s'. Skipping.",
            doc.get("file_name"),
        )
        return ""

    file_name: str = doc.get("file_name", "")
    ext = os.path.splitext(file_name)[-1] or ".pdf"

    try:
        with open(temp_path, "rb") as fh:
            raw_bytes = fh.read()

        text = extract_text_from_bytes(
            raw_bytes,
            ext,
            use_preprocessing=True,
            verbose=False,
        )
        return (text or "").strip()
    except Exception as exc:
        logger.error(
            "_extract_text_for_doc: OCR failed for '%s': %s", file_name, exc
        )
        return ""


# ─────────────────────────────────────────────────────────────────────────────
# Embedding helper
# ─────────────────────────────────────────────────────────────────────────────

def _embed_to_matrix(
    texts: list[str],
    vectorizer,
    mode: str = "passage",
) -> tuple[np.ndarray, object]:
    """
    Embed *texts* and return a L2-normalised float32 matrix ready for FAISS,
    together with the (possibly newly created) vectorizer.
    """
    if vectorizer is None:
        vectorizer = create_vectorizer()

    raw_embeddings, vectorizer = embed_texts(texts, vectorizer, mode=mode)
    matrix = np.stack(raw_embeddings).astype("float32")
    faiss.normalize_L2(matrix)
    return matrix, vectorizer


# ─────────────────────────────────────────────────────────────────────────────
# Incremental add helper
# ─────────────────────────────────────────────────────────────────────────────

def _embed_and_add_docs(
    docs_to_add: list[dict],
    file_paths: dict[str, str],
    index: Optional[faiss.Index],
    chunks_dict: dict[int, dict],
    vectorizer,
    manifest: dict,
) -> tuple:
    """
    Extract → clean → chunk → embed each doc in *docs_to_add* and insert
    the resulting vectors into *index* using stable integer IDs drawn from
    ``manifest["next_id"]``.

    Parameters
    ----------
    index:
        Existing ``IndexIDMap2`` instance, or ``None`` if this is the first
        build.  Created lazily on the first batch of embeddings.

    Returns
    -------
    (index, chunks_dict, vectorizer, manifest)
        All four objects updated in-place / replaced as needed.
    """
    for doc in docs_to_add:
        file_name = doc.get("file_name", "<unknown>")

        raw_text = _extract_text_for_doc(doc, file_paths)
        if not raw_text:
            logger.warning("No extractable text for '%s'. Skipping.", file_name)
            continue

        cleaned = clean_text(raw_text)
        if not cleaned:
            logger.warning("Text for '%s' was empty after cleaning. Skipping.", file_name)
            continue

        doc_chunks = chunk_text_with_metadata(
            cleaned,
            doc_id=str(doc["id"]),
            max_words=CHUNK_MAX_WORDS,
            overlap_words=CHUNK_OVERLAP_WORDS,
        )
        if not doc_chunks:
            logger.warning("No chunks produced for '%s'. Skipping.", file_name)
            continue

        texts  = [c["text"] for c in doc_chunks]
        matrix, vectorizer = _embed_to_matrix(texts, vectorizer, mode="passage")

        if index is None:
            # First-time build: wrap IndexFlatIP in IndexIDMap2 so we can
            # later remove specific vectors by their integer IDs.
            base  = faiss.IndexFlatIP(EMBEDDING_DIM)
            index = faiss.IndexIDMap2(base)

        next_id = manifest["next_id"]
        ids     = np.arange(next_id, next_id + len(doc_chunks), dtype=np.int64)

        index.add_with_ids(matrix, ids)

        for i, chunk in enumerate(doc_chunks):
            chunks_dict[int(ids[i])] = chunk

        manifest["docs"][doc["file_path"]] = {
            "sig":       _doc_sig(doc),
            "chunk_ids": ids.tolist(),
        }
        manifest["next_id"] = int(next_id + len(doc_chunks))

        logger.info("Indexed '%s': %d chunk(s), IDs %d–%d.", file_name, len(doc_chunks), next_id, manifest["next_id"] - 1)
        gc.collect()

    return index, chunks_dict, vectorizer, manifest


# ─────────────────────────────────────────────────────────────────────────────
# Public: incremental index updater
# ─────────────────────────────────────────────────────────────────────────────

def update_insurance_index(
    profile_id: str,
    docs: list[dict],
    file_paths: dict[str, str],
) -> tuple:
    """
    Bring the on-disk FAISS index up-to-date with the current document set.

    Algorithm
    ---------
    1. Compute delta (added/changed/removed) from manifest.
    2. If nothing changed **and** all artefacts exist → load and return.
    3. Load existing index (or start fresh).
    4. Remove vectors for deleted / changed documents.
    5. Embed and add vectors for new / changed documents.
    6. Persist index, chunks_dict, vectorizer, and manifest.

    Returns
    -------
    (index, chunks_dict, vectorizer)
    """
    manifest: dict = _load_manifest(profile_id)
    embedding_mismatch = not _manifest_embedding_matches_current(manifest)

    if embedding_mismatch:
        logger.info(
            "update_insurance_index [profile=%s]: embedding metadata mismatch; "
            "forcing full rebuild with current model.",
            profile_id,
        )
        to_add, to_remove = list(docs), []
    else:
        to_add, to_remove = get_docs_delta(profile_id, docs)

    # Fast path: nothing changed and all artefacts on disk
    if (
        not embedding_mismatch
        and not to_add
        and not to_remove
        and _index_artifacts_exist(profile_id)
    ):
        logger.info(
            "update_insurance_index [profile=%s]: index up-to-date, loading from disk.",
            profile_id,
        )
        return _load_index(profile_id)

    if embedding_mismatch:
        manifest = {"docs": {}, "next_id": 0, "embedding": get_embedding_metadata()}

    chunks_dict: dict[int, dict] = {}
    vectorizer                  = None
    index:       Optional[faiss.Index] = None

    # Load existing artefacts if they are present
    if _index_artifacts_exist(profile_id) and not embedding_mismatch:
        logger.info(
            "update_insurance_index [profile=%s]: loading existing index for incremental update.",
            profile_id,
        )
        index, chunks_dict, vectorizer = _load_index(profile_id)

    # ── Step 1: Remove stale / deleted document vectors ──────────────────────
    for fp in to_remove:
        doc_entry = manifest["docs"].get(fp)
        if not doc_entry or index is None:
            manifest["docs"].pop(fp, None)
            continue

        ids_to_purge = np.array(doc_entry["chunk_ids"], dtype=np.int64)
        index.remove_ids(ids_to_purge)

        for cid in doc_entry["chunk_ids"]:
            chunks_dict.pop(cid, None)

        del manifest["docs"][fp]
        logger.info(
            "Purged %d vector(s) for removed/changed doc '%s'.", len(ids_to_purge), fp
        )

    # ── Step 2: Embed and insert new / changed documents ─────────────────────
    if to_add:
        logger.info(
            "update_insurance_index [profile=%s]: embedding %d new/changed doc(s).",
            profile_id, len(to_add),
        )
        index, chunks_dict, vectorizer, manifest = _embed_and_add_docs(
            to_add, file_paths, index, chunks_dict, vectorizer, manifest
        )

    # ── Sanity check ─────────────────────────────────────────────────────────
    if index is None or index.ntotal == 0:
        raise ValueError(
            f"No text chunks could be produced from {len(docs)} insurance "
            "document(s). Ensure uploaded documents contain extractable or "
            "OCR-readable text."
        )

    # ── Persist ───────────────────────────────────────────────────────────────
    _save_index(profile_id, index, chunks_dict, vectorizer)
    _save_manifest(profile_id, manifest)

    logger.info(
        "update_insurance_index [profile=%s]: index now holds %d vector(s).",
        profile_id, index.ntotal,
    )
    return index, chunks_dict, vectorizer


# ─────────────────────────────────────────────────────────────────────────────
# Public invalidation hook
# ─────────────────────────────────────────────────────────────────────────────

def invalidate_index(profile_id: str) -> None:
    """
    Completely remove the persisted index directory for *profile_id*.
    Call this from upload / delete webhooks when a full rebuild is preferred
    over incremental updates (e.g. bulk re-processing).
    """
    p = _profile_dir(profile_id)
    if os.path.exists(p):
        shutil.rmtree(p)
        logger.info("invalidate_index: removed index directory for profile %s (%s).", profile_id, p)
    else:
        logger.debug("invalidate_index: no directory to remove for profile %s.", profile_id)


# ─────────────────────────────────────────────────────────────────────────────
# Similarity search
# ─────────────────────────────────────────────────────────────────────────────

def search_index(
    index: faiss.Index,
    chunks_dict: dict[int, dict],
    vectorizer,
    query: str,
    top_k: int = TOP_K,
    min_score: float = MIN_SIMILARITY_SCORE,
) -> list[dict]:
    """
    Embed *query*, run a nearest-neighbour search on *index*, and return the
    top-k chunks that meet the *min_score* threshold.

    ``chunks_dict`` is keyed by the integer IDs stored in the ``IndexIDMap2``
    index, so ``chunks_dict[returned_id]`` always resolves correctly even after
    incremental additions and removals.
    """
    if not query or not query.strip():
        return []

    query_matrix, _ = _embed_to_matrix([query.strip()], vectorizer, mode="query")

    actual_k = min(top_k, index.ntotal)
    if actual_k == 0:
        return []

    scores, indices = index.search(query_matrix, actual_k)

    results: list[dict] = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < 0:
            continue
        sim = float(score)
        if sim < min_score:
            continue
        chunk = chunks_dict.get(int(idx))
        if chunk is None:
            continue
        hit = dict(chunk)
        hit["score"] = sim
        results.append(hit)

    return results


# ─────────────────────────────────────────────────────────────────────────────
# Prompt construction & LLM query
# ─────────────────────────────────────────────────────────────────────────────

def _get_system_prompt(user_name: str) -> str:
    return (
        f"You are a knowledgeable, precise insurance assistant helping {user_name} "
        "understand the details of their personal health insurance documents.\n\n"
        "Guidelines:\n"
        "- Answer ONLY from the provided document excerpts.\n"
        "- Be factual and specific: cite coverage limits, exclusions, waiting periods, "
        "  claim procedures, or premium details when present in the excerpts.\n"
        "- If the question cannot be answered from the excerpts, say so clearly and "
        "  indicate what type of document or section might contain the answer.\n"
        "- Do NOT invent, extrapolate, or assume any policy details not present in the "
        "  excerpts.\n"
        "- Use clear, plain language; avoid unnecessary jargon.\n"
        "- Respond in the same language the user used."
    )


def _build_user_prompt(user_question: str, context_chunks: list[dict]) -> str:
    excerpt_blocks = "\n\n".join(
        (
            f"[Excerpt {i}  |  doc_id={c.get('doc_id', 'N/A')}  |  "
            f"relevance={c.get('score', 0.0):.3f}]\n{c['text']}"
        )
        for i, c in enumerate(context_chunks, 1)
    )
    return (
        f"Insurance Document Excerpts:\n"
        f"{excerpt_blocks}\n\n"
        f"User Question: {user_question}\n\n"
        "Please answer strictly based on the excerpts above."
    )


def query_openai(
    user_question: str,
    context_chunks: list[dict],
    user_name: str,
) -> str:
    user_prompt   = _build_user_prompt(user_question, context_chunks)
    system_prompt = _get_system_prompt(user_name)
    logger.info("query_openai: dispatching to call_llm with %d chunk(s).", len(context_chunks))
    return call_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=OPENAI_MAX_TOKENS,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public pipeline entry point
# ─────────────────────────────────────────────────────────────────────────────

def run_insurance_rag(
    profile_id: str,
    user_question: str,
    docs: list[dict],
    file_paths: dict[str, str],
    user_name: str = "the user",
) -> str:
    """
    Execute the full insurance RAG pipeline for a single user query.

    Parameters
    ----------
    profile_id:
        Supabase profile UUID string.
    user_question:
        Raw question text.
    docs:
        Metadata dicts for all current vault documents.
    file_paths:
        ``{logical_file_path: temp_file_path}`` for documents that needed
        downloading.  Unchanged documents are absent from this dict; their
        text is already in the index.
    user_name:
        Display name for the LLM system prompt.

    Returns
    -------
    str
        LLM-generated answer, or a descriptive error message string.
    """
    logger.info(
        "run_insurance_rag [profile=%s]: question='%.100s'", profile_id, user_question
    )

    if not docs:
        return (
            "No insurance files were found in your vault. "
            "Please upload your insurance policy, health card, or related documents "
            "to the Insurance folder, then try again."
        )

    try:
        # 1. Incrementally update (or load) the index
        index, chunks_dict, vectorizer = update_insurance_index(
            profile_id, docs, file_paths
        )

        # 2. Similarity search
        context_chunks = search_index(index, chunks_dict, vectorizer, user_question)

        if not context_chunks:
            return (
                "I couldn't find relevant information in your insurance documents "
                "to answer that question. The answer may be in a section that has "
                "not been uploaded yet, or the question may be outside the scope of "
                "your current policy documents."
            )

        # 3. LLM generation
        logger.info("Generating answer from %d retrieved chunk(s).", len(context_chunks))
        answer = query_openai(user_question, context_chunks, user_name)

        logger.info(
            "run_insurance_rag [profile=%s]: answer generated (%d chars).",
            profile_id, len(answer),
        )
        return answer

    except Exception as exc:
        logger.exception(
            "run_insurance_rag [profile=%s]: pipeline error: %s", profile_id, exc
        )
        return f"Insurance RAG pipeline error: {exc}"


# ─────────────────────────────────────────────────────────────────────────────
# Back-compat shims (kept so existing callers compile without modification)
# ─────────────────────────────────────────────────────────────────────────────

def compute_docs_signature(docs: list[dict]) -> str:
    """
    Deprecated: whole-set SHA-256 signature.
    Kept for external callers; new code should use get_docs_delta() instead.
    """
    import hashlib
    fingerprints = sorted(_doc_sig(d) for d in docs)
    raw = "|".join(fingerprints).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def is_index_valid(profile_id: str, current_sig: str) -> bool:
    """
    Deprecated: whole-set validity check.
    Kept for external callers; new code should use update_insurance_index()
    which handles incremental deltas automatically.
    """
    to_add, to_remove = get_docs_delta(profile_id, [])
    return _index_artifacts_exist(profile_id) and not to_add and not to_remove
