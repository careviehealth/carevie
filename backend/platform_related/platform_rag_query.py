"""
Platform RAG pipeline with one-time vector creation and cached reuse.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import pickle
import shutil
import sys
from pathlib import Path

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


VECTOR_BASE_DIR: str = os.getenv(
    "PLATFORM_VECTOR_DIR",
    os.path.join("vectors", "platform_vector"),
)
KB_FILE_PATH: str = os.getenv(
    "PLATFORM_KB_PATH",
    os.path.join(os.path.dirname(__file__), "documents", "knowledge_base.txt"),
)

TOP_K: int = int(os.getenv("PLATFORM_RAG_TOP_K", "6"))
MIN_SIMILARITY_SCORE: float = float(os.getenv("PLATFORM_RAG_MIN_SCORE", "0.22"))
CHUNK_MAX_WORDS: int = int(os.getenv("PLATFORM_RAG_CHUNK_MAX_WORDS", "220"))
CHUNK_OVERLAP_WORDS: int = int(os.getenv("PLATFORM_RAG_CHUNK_OVERLAP_WORDS", "40"))
OPENAI_MAX_TOKENS: int = int(os.getenv("PLATFORM_RAG_MAX_TOKENS", "800"))


def _manifest_path() -> str:
    return os.path.join(VECTOR_BASE_DIR, "manifest.json")


def _index_artifacts_exist() -> bool:
    return all(
        os.path.exists(os.path.join(VECTOR_BASE_DIR, fname))
        for fname in ("index.faiss", "chunks_dict.pkl", "vectorizer.pkl", "manifest.json")
    )


def _load_manifest() -> dict:
    path = _manifest_path()
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as fh:
                raw = json.load(fh)
                raw.setdefault("kb_sig", "")
                raw.setdefault("embedding", {})
                return raw
    except Exception as exc:
        logger.warning("_load_manifest failed: %s", exc)
    return {"kb_sig": "", "embedding": {}}


def _save_manifest(manifest: dict) -> None:
    Path(VECTOR_BASE_DIR).mkdir(parents=True, exist_ok=True)
    dest = _manifest_path()
    tmp = dest + ".tmp"
    manifest["embedding"] = get_embedding_metadata()
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
    os.replace(tmp, dest)


def _manifest_embedding_matches_current(manifest: dict) -> bool:
    current = get_embedding_metadata()
    stored = manifest.get("embedding") or {}
    return (
        stored.get("model_name") == current["model_name"]
        and stored.get("schema_version") == current["schema_version"]
        and int(stored.get("embedding_dim", -1)) == current["embedding_dim"]
    )


def _load_kb_text() -> str:
    if not os.path.exists(KB_FILE_PATH):
        raise FileNotFoundError(f"Knowledge base file not found: {KB_FILE_PATH}")
    with open(KB_FILE_PATH, "r", encoding="utf-8") as fh:
        text = fh.read().strip()
    if not text:
        raise ValueError("Knowledge base file is empty")
    return text


def _compute_kb_sig(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _save_index(index: faiss.Index, chunks_dict: dict[int, dict], vectorizer) -> None:
    Path(VECTOR_BASE_DIR).mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, os.path.join(VECTOR_BASE_DIR, "index.faiss"))
    with open(os.path.join(VECTOR_BASE_DIR, "chunks_dict.pkl"), "wb") as fh:
        pickle.dump(chunks_dict, fh)
    with open(os.path.join(VECTOR_BASE_DIR, "vectorizer.pkl"), "wb") as fh:
        pickle.dump(vectorizer, fh)


def _load_index() -> tuple[faiss.Index, dict[int, dict], object]:
    index = faiss.read_index(os.path.join(VECTOR_BASE_DIR, "index.faiss"))
    with open(os.path.join(VECTOR_BASE_DIR, "chunks_dict.pkl"), "rb") as fh:
        chunks_dict = pickle.load(fh)
    with open(os.path.join(VECTOR_BASE_DIR, "vectorizer.pkl"), "rb") as fh:
        vectorizer = pickle.load(fh)
    return index, chunks_dict, vectorizer


def _embed_to_matrix(
    texts: list[str],
    vectorizer,
    mode: str = "passage",
) -> tuple[np.ndarray, object]:
    if vectorizer is None:
        vectorizer = create_vectorizer()
    raw_embeddings, vectorizer = embed_texts(texts, vectorizer=vectorizer, mode=mode)
    matrix = np.stack(raw_embeddings).astype("float32")
    faiss.normalize_L2(matrix)
    return matrix, vectorizer


def _build_platform_index(kb_text: str) -> tuple[faiss.Index, dict[int, dict], object]:
    cleaned = clean_text(kb_text)
    chunks = chunk_text_with_metadata(
        cleaned,
        doc_id="platform_knowledge_base",
        max_words=CHUNK_MAX_WORDS,
        overlap_words=CHUNK_OVERLAP_WORDS,
    )
    if not chunks:
        raise ValueError("No chunks produced from platform knowledge base")

    matrix, vectorizer = _embed_to_matrix([c["text"] for c in chunks], None, mode="passage")
    index = faiss.IndexIDMap2(faiss.IndexFlatIP(EMBEDDING_DIM))
    ids = np.arange(0, len(chunks), dtype=np.int64)
    index.add_with_ids(matrix, ids)
    chunks_dict = {int(ids[i]): chunks[i] for i in range(len(chunks))}
    _save_index(index, chunks_dict, vectorizer)
    _save_manifest(
        {
            "kb_sig": _compute_kb_sig(kb_text),
        }
    )
    logger.info("Platform index built with %d chunks.", len(chunks))
    return index, chunks_dict, vectorizer


def ensure_platform_index_ready() -> tuple[faiss.Index, dict[int, dict], object]:
    kb_text = _load_kb_text()
    kb_sig = _compute_kb_sig(kb_text)

    if _index_artifacts_exist():
        manifest = _load_manifest()
        if _manifest_embedding_matches_current(manifest) and manifest.get("kb_sig") == kb_sig:
            return _load_index()
        logger.info("Platform index stale/incompatible. Rebuilding from knowledge base.")

    return _build_platform_index(kb_text)


def search_index(
    index: faiss.Index,
    chunks_dict: dict[int, dict],
    vectorizer,
    query: str,
    top_k: int = TOP_K,
    min_score: float = MIN_SIMILARITY_SCORE,
) -> list[dict]:
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
        if not chunk:
            continue
        hit = dict(chunk)
        hit["score"] = sim
        results.append(hit)
    return results


def _get_system_prompt() -> str:
    return (
        "You are a precise CareVie platform assistant.\n"
        "Guidelines:\n"
        "- Answer ONLY from the provided platform excerpts.\n"
        "- If answer is unavailable in excerpts, say you do not have enough information.\n"
        "- Respond in the same language used by the user.\n"
        "- Keep responses short, clear, and action-oriented for product usage questions."
    )


def _build_user_prompt(user_question: str, context_chunks: list[dict]) -> str:
    excerpt_blocks = "\n\n".join(
        (
            f"[Excerpt {i} | relevance={c.get('score', 0.0):.3f}]\n{c['text']}"
        )
        for i, c in enumerate(context_chunks, 1)
    )
    return (
        f"CareVie Platform Excerpts:\n{excerpt_blocks}\n\n"
        f"User Question: {user_question}\n\n"
        "Answer strictly from the excerpts."
    )


def query_openai(user_question: str, context_chunks: list[dict]) -> str:
    return call_llm(
        system_prompt=_get_system_prompt(),
        user_prompt=_build_user_prompt(user_question, context_chunks),
        max_tokens=OPENAI_MAX_TOKENS,
    )


def run_platform_rag(user_question: str) -> str:
    if not user_question or not user_question.strip():
        return "Please ask a valid platform-related question."

    try:
        index, chunks_dict, vectorizer = ensure_platform_index_ready()
        context_chunks = search_index(index, chunks_dict, vectorizer, user_question)
        if not context_chunks:
            return "I don't have enough information to answer that."
        return query_openai(user_question, context_chunks)
    except FileNotFoundError:
        return "Platform knowledge base is not configured correctly. Please contact support."
    except Exception as exc:
        logger.exception("run_platform_rag error: %s", exc)
        return "Something went wrong while answering your platform question."


def invalidate_platform_index() -> None:
    if os.path.exists(VECTOR_BASE_DIR):
        shutil.rmtree(VECTOR_BASE_DIR)
        logger.info("invalidate_platform_index: removed %s", VECTOR_BASE_DIR)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(run_platform_rag("How can I upload my lab reports?"))
