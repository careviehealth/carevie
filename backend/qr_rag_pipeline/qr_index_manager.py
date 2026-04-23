"""
qr_index_manager.py
====================
Self-contained incremental FAISS index manager for QR emergency summaries.

Mirrors the architecture of ``lab_report_rag.py`` and ``insurance_rag_query.py``
but accepts ``vector_dir`` as an **explicit parameter** instead of relying on a
module-level global.  This makes it safe for concurrent use from the QR pipeline
without interfering with the interactive-query pipelines.

Depends ONLY on the shared ``rag_pipeline/`` primitives:
  - ``rag_pipeline.clean_chunk``    → ``chunk_text_with_metadata``, ``clean_text``
  - ``rag_pipeline.embed_store``    → ``EMBEDDING_DIM``, ``create_vectorizer``,
                                       ``embed_texts``, ``get_embedding_metadata``
  - ``rag_pipeline.extractor_OCR``  → ``extract_text_from_bytes``

Storage layout (per vector_dir)
-------------------------------
  {vector_dir}/{profile_id}/
    ├── index.faiss
    ├── chunks_dict.pkl
    ├── vectorizer.pkl
    └── manifest.json
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


# ─────────────────────────────────────────────────────────────────────────────
# Configuration defaults
# ─────────────────────────────────────────────────────────────────────────────

CHUNK_MAX_WORDS:     int = 300
CHUNK_OVERLAP_WORDS: int = 50
DEFAULT_TOP_K:       int = 6
DEFAULT_MIN_SCORE:   float = 0.22


# ─────────────────────────────────────────────────────────────────────────────
# Path helpers — all take vector_dir explicitly
# ─────────────────────────────────────────────────────────────────────────────

def _profile_dir(vector_dir: str, profile_id: str) -> str:
    return os.path.join(vector_dir, str(profile_id))


def _manifest_path(vector_dir: str, profile_id: str) -> str:
    return os.path.join(_profile_dir(vector_dir, profile_id), "manifest.json")


# ─────────────────────────────────────────────────────────────────────────────
# Manifest helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_manifest(vector_dir: str, profile_id: str) -> dict:
    """
    Load manifest.json for *profile_id* under *vector_dir*.
    Returns an empty manifest structure if the file is absent or unreadable.
    """
    path = _manifest_path(vector_dir, profile_id)
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
                raw.setdefault("docs", {})
                raw.setdefault("next_id", 0)
                raw.setdefault("embedding", {})
                return raw
    except Exception as exc:
        logger.warning(
            "_load_manifest: failed for profile %s in %s: %s",
            profile_id, vector_dir, exc,
        )
    return {"docs": {}, "next_id": 0, "embedding": {}}


def _save_manifest(vector_dir: str, profile_id: str, manifest: dict) -> None:
    """Persist *manifest* to disk atomically via a temp-file rename."""
    pdir = _profile_dir(vector_dir, profile_id)
    Path(pdir).mkdir(parents=True, exist_ok=True)
    dest = _manifest_path(vector_dir, profile_id)
    tmp = dest + ".tmp"
    try:
        manifest["embedding"] = get_embedding_metadata()
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(manifest, fh, indent=2)
        os.replace(tmp, dest)  # atomic on POSIX
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
    Incorporates both the logical path and the storage etag / content hash.
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
    vector_dir: str,
) -> tuple[list[dict], list[str]]:
    """
    Compare *docs* (current vault listing) against the stored manifest.

    Returns
    -------
    to_add : list[dict]
        Documents that need (re-)embedding — new or changed.
    to_remove : list[str]
        Logical file paths whose vectors must be purged — deleted or changed.
    """
    manifest = _load_manifest(vector_dir, profile_id)
    stored_docs = manifest.get("docs", {})
    current_paths = {d["file_path"] for d in docs}
    stored_paths = set(stored_docs.keys())

    # Docs present in manifest but no longer in the vault
    to_remove: list[str] = list(stored_paths - current_paths)

    to_add: list[dict] = []
    for doc in docs:
        fp = doc["file_path"]
        sig = _doc_sig(doc)
        if fp not in stored_docs or stored_docs[fp]["sig"] != sig:
            to_add.append(doc)
            if fp in stored_docs:
                to_remove.append(fp)

    logger.info(
        "get_docs_delta [profile=%s, dir=%s]: %d to_add, %d to_remove, %d unchanged.",
        profile_id, os.path.basename(vector_dir),
        len(to_add), len(to_remove), len(docs) - len(to_add),
    )
    return to_add, to_remove


# ─────────────────────────────────────────────────────────────────────────────
# Index existence check
# ─────────────────────────────────────────────────────────────────────────────

def _index_artifacts_exist(vector_dir: str, profile_id: str) -> bool:
    """Return True only if all four artefacts are present on disk."""
    p = _profile_dir(vector_dir, profile_id)
    return all(
        os.path.exists(os.path.join(p, fname))
        for fname in ("index.faiss", "chunks_dict.pkl", "vectorizer.pkl", "manifest.json")
    )


# ─────────────────────────────────────────────────────────────────────────────
# Low-level index persistence
# ─────────────────────────────────────────────────────────────────────────────

def _save_index(
    vector_dir: str,
    profile_id: str,
    index: faiss.Index,
    chunks_dict: dict[int, dict],
    vectorizer,
) -> None:
    """Persist the FAISS index, chunk dict, and vectorizer to disk."""
    p = _profile_dir(vector_dir, profile_id)
    Path(p).mkdir(parents=True, exist_ok=True)

    faiss.write_index(index, os.path.join(p, "index.faiss"))

    with open(os.path.join(p, "chunks_dict.pkl"), "wb") as fh:
        pickle.dump(chunks_dict, fh)

    with open(os.path.join(p, "vectorizer.pkl"), "wb") as fh:
        pickle.dump(vectorizer, fh)

    logger.info(
        "_save_index: persisted %d vector(s) for profile %s in %s.",
        index.ntotal, profile_id, os.path.basename(vector_dir),
    )


def _load_index(vector_dir: str, profile_id: str) -> tuple:
    """
    Load FAISS index, chunks dict, and vectorizer from disk.

    Returns
    -------
    (index, chunks_dict, vectorizer)
    """
    p = _profile_dir(vector_dir, profile_id)

    index = faiss.read_index(os.path.join(p, "index.faiss"))
    logger.info(
        "_load_index: %d vector(s) loaded for profile %s.",
        index.ntotal, profile_id,
    )

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

    Fast path: if ``extracted_text`` is already stored, use it directly.
    Slow path: read raw bytes from the temp file on disk and run OCR.
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
            "_extract_text_for_doc: OCR failed for '%s': %s", file_name, exc,
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
    the resulting vectors into *index*.
    """
    for doc in docs_to_add:
        file_name = doc.get("file_name", "<unknown>")

        raw_text = _extract_text_for_doc(doc, file_paths)
        if not raw_text:
            logger.warning("No extractable text for '%s'. Skipping.", file_name)
            continue

        cleaned = clean_text(raw_text)
        if not cleaned:
            logger.warning(
                "Text for '%s' was empty after cleaning. Skipping.", file_name,
            )
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

        texts = [c["text"] for c in doc_chunks]
        matrix, vectorizer = _embed_to_matrix(texts, vectorizer, mode="passage")

        if index is None:
            base = faiss.IndexFlatIP(EMBEDDING_DIM)
            index = faiss.IndexIDMap2(base)

        next_id = manifest["next_id"]
        ids = np.arange(next_id, next_id + len(doc_chunks), dtype=np.int64)

        index.add_with_ids(matrix, ids)

        for i, chunk in enumerate(doc_chunks):
            chunks_dict[int(ids[i])] = chunk

        manifest["docs"][doc["file_path"]] = {
            "sig": _doc_sig(doc),
            "chunk_ids": ids.tolist(),
        }
        manifest["next_id"] = int(next_id + len(doc_chunks))

        logger.info(
            "Indexed '%s': %d chunk(s), IDs %d–%d.",
            file_name, len(doc_chunks), next_id, manifest["next_id"] - 1,
        )
        gc.collect()

    return index, chunks_dict, vectorizer, manifest


# ─────────────────────────────────────────────────────────────────────────────
# Public: incremental index updater
# ─────────────────────────────────────────────────────────────────────────────

def update_index(
    profile_id: str,
    docs: list[dict],
    file_paths: dict[str, str],
    vector_dir: str,
) -> tuple:
    """
    Bring the on-disk FAISS index in *vector_dir* up-to-date with the current
    document set.

    Algorithm
    ---------
    1. Compute delta (added/changed/removed) from manifest.
    2. If nothing changed and all artefacts exist → load and return.
    3. Load existing index (or start fresh).
    4. Remove vectors for deleted / changed documents.
    5. Embed and add vectors for new / changed documents.
    6. Persist index, chunks_dict, vectorizer, and manifest.

    Returns
    -------
    (index, chunks_dict, vectorizer)
    """
    manifest = _load_manifest(vector_dir, profile_id)
    embedding_mismatch = not _manifest_embedding_matches_current(manifest)

    if embedding_mismatch:
        logger.info(
            "update_index [profile=%s, dir=%s]: embedding metadata mismatch; "
            "forcing full rebuild.",
            profile_id, os.path.basename(vector_dir),
        )
        to_add, to_remove = list(docs), []
    else:
        to_add, to_remove = get_docs_delta(profile_id, docs, vector_dir)

    # Fast path: nothing changed and all artefacts on disk
    if (
        not embedding_mismatch
        and not to_add
        and not to_remove
        and _index_artifacts_exist(vector_dir, profile_id)
    ):
        logger.info(
            "update_index [profile=%s, dir=%s]: index up-to-date, loading from disk.",
            profile_id, os.path.basename(vector_dir),
        )
        return _load_index(vector_dir, profile_id)

    if embedding_mismatch:
        manifest = {"docs": {}, "next_id": 0, "embedding": get_embedding_metadata()}

    chunks_dict: dict[int, dict] = {}
    vectorizer = None
    index: Optional[faiss.Index] = None

    # Load existing artefacts if they are present
    if _index_artifacts_exist(vector_dir, profile_id) and not embedding_mismatch:
        logger.info(
            "update_index [profile=%s, dir=%s]: loading existing index for incremental update.",
            profile_id, os.path.basename(vector_dir),
        )
        index, chunks_dict, vectorizer = _load_index(vector_dir, profile_id)

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
            "Purged %d vector(s) for removed/changed doc '%s'.",
            len(ids_to_purge), fp,
        )

    # ── Step 2: Embed and insert new / changed documents ─────────────────────
    if to_add:
        logger.info(
            "update_index [profile=%s, dir=%s]: embedding %d new/changed doc(s).",
            profile_id, os.path.basename(vector_dir), len(to_add),
        )
        index, chunks_dict, vectorizer, manifest = _embed_and_add_docs(
            to_add, file_paths, index, chunks_dict, vectorizer, manifest,
        )

    # ── Sanity check ─────────────────────────────────────────────────────────
    if index is None or index.ntotal == 0:
        raise ValueError(
            f"No text chunks could be produced from {len(docs)} document(s). "
            "Ensure uploaded documents contain extractable or OCR-readable text."
        )

    # ── Persist ──────────────────────────────────────────────────────────────
    _save_index(vector_dir, profile_id, index, chunks_dict, vectorizer)
    _save_manifest(vector_dir, profile_id, manifest)

    logger.info(
        "update_index [profile=%s, dir=%s]: index now holds %d vector(s).",
        profile_id, os.path.basename(vector_dir), index.ntotal,
    )
    return index, chunks_dict, vectorizer


# ─────────────────────────────────────────────────────────────────────────────
# Public: invalidation hook
# ─────────────────────────────────────────────────────────────────────────────

def invalidate_index(profile_id: str, vector_dir: str) -> None:
    """Completely remove the persisted index directory for *profile_id*."""
    p = _profile_dir(vector_dir, profile_id)
    if os.path.exists(p):
        shutil.rmtree(p)
        logger.info(
            "invalidate_index: removed index directory for profile %s (%s).",
            profile_id, p,
        )
    else:
        logger.debug(
            "invalidate_index: no directory to remove for profile %s.", profile_id,
        )


# ─────────────────────────────────────────────────────────────────────────────
# Public: similarity search
# ─────────────────────────────────────────────────────────────────────────────

def search_index(
    index: faiss.Index,
    chunks_dict: dict[int, dict],
    vectorizer,
    query: str,
    top_k: int = DEFAULT_TOP_K,
    min_score: float = DEFAULT_MIN_SCORE,
) -> list[dict]:
    """
    Embed *query*, run a nearest-neighbour search on *index*, and return the
    top-k chunks that meet the *min_score* threshold.
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
