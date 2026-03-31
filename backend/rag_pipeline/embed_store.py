# backend/rag_pipeline/embed_store.py
#
# Embedding and FAISS index layer for the medical RAG pipeline.
# Uses sentence-transformers (all-MiniLM-L6-v2) for dense 384-d embeddings.
#
# Chunk contract: all callers must supply List[dict] from
# clean_chunk.chunk_text_with_metadata().  Each dict has two keys:
#   "text"   — the plain text string to embed
#   "doc_id" — source filename, used by rag_query for per-document diversity
#
# Public API:
#   EMBEDDING_DIM                            constant  (384)
#   create_vectorizer()                      returns SentenceTransformerVectorizer
#   embed_texts(texts, vectorizer=None)      returns (List[np.ndarray], vectorizer)
#   build_faiss_index(chunks, temp_dir)      returns (index, chunks, vectorizer)
#   load_index_and_chunks(temp_dir)          returns (index, chunks, vectorizer)
#   search_similar(query, temp_dir, top_k=5) returns List[(text, score)]

import os
import pickle
import numpy as np
import faiss
from typing import List

from sentence_transformers import SentenceTransformer


# ── Constants ────────────────────────────────────────────────────────────────

EMBEDDING_DIM = 384          # all-MiniLM-L6-v2 native output dimension
_MODEL_NAME   = "all-MiniLM-L6-v2"


# ── Thin matrix wrapper ───────────────────────────────────────────────────────
# Mimics the return value of sklearn's fit_transform / transform so that
# existing call sites (.toarray(), .toarray()[0]) continue to work unchanged.

class _DenseMatrix:
    """Wraps a float32 ndarray to expose the sklearn .toarray() interface."""

    def __init__(self, array: np.ndarray):
        self._array = np.asarray(array, dtype='float32')

    def toarray(self) -> np.ndarray:
        return self._array


# ── Drop-in vectorizer replacement ───────────────────────────────────────────
# Preserves the sklearn Vectorizer interface used by external call sites:
#
#   vectorizer.fit_transform(texts).toarray()      → ndarray (n, 384)
#   vectorizer.transform([query]).toarray()[0]     → ndarray (384,)
#
# The model is loaded lazily on first use and cached on the instance so that
# pickle round-trips (save → load) work without re-downloading weights.

class SentenceTransformerVectorizer:
    """
    Sentence-transformer wrapper with an sklearn-compatible interface.

    Picklable: the model name is stored; the live SentenceTransformer object
    is recreated transparently after unpickling.
    """

    def __init__(self, model_name: str = _MODEL_NAME):
        self.model_name = model_name
        self._model: SentenceTransformer | None = None

    # ── Lazy model loader ────────────────────────────────────────────────────

    def _get_model(self) -> SentenceTransformer:
        if self._model is None:
            print(f"   🤖 Loading sentence-transformer: {self.model_name} (device: cpu)", flush=True)
            # Force CPU — avoids CUDA capability mismatch on older GPUs (sm_61 etc.)
            # all-MiniLM-L6-v2 is fast enough on CPU for RAG workloads.
            self._model = SentenceTransformer(self.model_name, device="cpu")
        return self._model

    # ── Sklearn-compatible interface ─────────────────────────────────────────

    def fit_transform(self, texts: List[str]) -> _DenseMatrix:
        """Encode texts. 'fit' is a no-op — the model is pre-trained."""
        return self._encode(texts)

    def transform(self, texts: List[str]) -> _DenseMatrix:
        """Encode texts using the pre-trained model."""
        return self._encode(texts)

    # ── Internal ─────────────────────────────────────────────────────────────

    def _encode(self, texts: List[str]) -> _DenseMatrix:
        model = self._get_model()
        # normalize_embeddings=False — FAISS normalize_L2 handles normalisation
        embeddings = model.encode(
            texts,
            normalize_embeddings=False,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return _DenseMatrix(embeddings.astype('float32'))

    # ── Pickle support ───────────────────────────────────────────────────────

    def __getstate__(self):
        # Drop the live model; only the name is needed to reconstruct it.
        return {'model_name': self.model_name}

    def __setstate__(self, state):
        self.model_name = state['model_name']
        self._model = None          # will be lazy-loaded on next use


# ── Public helpers ────────────────────────────────────────────────────────────

def create_vectorizer() -> SentenceTransformerVectorizer:
    """
    Return a ready-to-use vectorizer.
    Replaces the old TfidfVectorizer factory — signature unchanged.
    """
    return SentenceTransformerVectorizer(_MODEL_NAME)


def embed_texts(texts: List[str], vectorizer=None) -> tuple:
    """
    Embed a list of text chunks into 384-d float32 vectors.

    Args:
        texts:      Raw text chunks.
        vectorizer: Optional existing SentenceTransformerVectorizer.
                    If None a new one is created.

    Returns:
        (embeddings, vectorizer)
          embeddings  — List[np.ndarray], each shape (384,), dtype float32
          vectorizer  — the SentenceTransformerVectorizer used
    """
    print(f"\n📊 Embedding {len(texts)} chunks...", flush=True)

    valid_texts = [t.strip() for t in texts if t and t.strip()]

    if not valid_texts:
        raise ValueError("All chunks are empty!")

    print(f"   Valid chunks: {len(valid_texts)}", flush=True)

    if vectorizer is None:
        vectorizer = create_vectorizer()

    try:
        print("   🔧 Encoding with sentence-transformer...", flush=True)

        # fit_transform is identical to transform for a pre-trained model
        embeddings_matrix = vectorizer.fit_transform(valid_texts).toarray()

        # Sanity-check: model always returns exactly EMBEDDING_DIM dimensions.
        # This assertion replaces the old zero-padding block.
        assert embeddings_matrix.shape[1] == EMBEDDING_DIM, (
            f"Model returned {embeddings_matrix.shape[1]}-d vectors; "
            f"expected {EMBEDDING_DIM}. Check model name."
        )

        print(f"   ✅ Embeddings shape: {embeddings_matrix.shape}", flush=True)

        embeddings = list(embeddings_matrix)     # List[np.ndarray (384,)]
        return embeddings, vectorizer

    except Exception as e:
        print(f"   ❌ Embedding failed: {e}", flush=True)
        raise


def build_faiss_index(chunks: List[dict], temp_dir: str) -> tuple:
    """
    Build a FAISS IndexFlatIP from metadata-aware chunks and persist to temp_dir.

    Args:
        chunks:   List[dict] produced by chunk_text_with_metadata().
                  Each dict must have keys "text" (str) and "doc_id" (str).
        temp_dir: Temporary directory for this request.

    Returns:
        (index, chunks, vectorizer)
    """
    if not chunks:
        raise ValueError("No chunks provided to index")

    print(f"\n🔧 Building FAISS index...", flush=True)
    print(f"   Chunks: {len(chunks)}", flush=True)

    # Extract plain text strings for the embedding model
    texts = [c["text"] for c in chunks]

    # Embed
    embeddings, vectorizer = embed_texts(texts)

    # Stack → (n, 384) float32 matrix
    embedding_matrix = np.stack(embeddings)
    dim = embedding_matrix.shape[1]

    print(f"   Dimensions: {dim}", flush=True)
    print(f"   Matrix shape: {embedding_matrix.shape}", flush=True)

    if dim != EMBEDDING_DIM:
        raise ValueError(f"Dimension mismatch! Expected {EMBEDDING_DIM}, got {dim}")

    # Normalise for cosine similarity via inner product
    print("   🔧 Normalizing vectors...", flush=True)
    faiss.normalize_L2(embedding_matrix)

    # Build index
    print("   🔧 Creating FAISS index...", flush=True)
    index = faiss.IndexFlatIP(dim)
    index.add(embedding_matrix)
    print(f"   ✅ Index created: {index.ntotal} vectors", flush=True)

    # Persist to temp_dir
    index_path      = os.path.join(temp_dir, "index.faiss")
    chunks_path     = os.path.join(temp_dir, "chunks.pkl")
    vectorizer_path = os.path.join(temp_dir, "vectorizer.pkl")

    faiss.write_index(index, index_path)

    with open(chunks_path, "wb") as f:
        pickle.dump(chunks, f)

    with open(vectorizer_path, "wb") as f:
        pickle.dump(vectorizer, f)

    print(f"   ✅ Saved to temp: {temp_dir}", flush=True)
    print("✅ FAISS index built successfully!", flush=True)

    return index, chunks, vectorizer


def load_index_and_chunks(temp_dir: str):
    """
    Load FAISS index, chunks and vectorizer from temp_dir.
    Signature and return type unchanged.
    """
    print(f"\n📂 Loading from temp: {temp_dir}...", flush=True)

    index_path      = os.path.join(temp_dir, "index.faiss")
    chunks_path     = os.path.join(temp_dir, "chunks.pkl")
    vectorizer_path = os.path.join(temp_dir, "vectorizer.pkl")

    if not os.path.exists(index_path):
        raise FileNotFoundError(f"Index not found: {index_path}")
    if not os.path.exists(chunks_path):
        raise FileNotFoundError(f"Chunks not found: {chunks_path}")
    if not os.path.exists(vectorizer_path):
        raise FileNotFoundError(f"Vectorizer not found: {vectorizer_path}")

    index = faiss.read_index(index_path)
    print(f"   ✅ Index loaded: {index.ntotal} vectors", flush=True)

    with open(chunks_path, "rb") as f:
        chunks = pickle.load(f)

    print(f"   ✅ Chunks loaded: {len(chunks)} chunks", flush=True)

    with open(vectorizer_path, "rb") as f:
        vectorizer = pickle.load(f)
    print(f"   ✅ Vectorizer loaded", flush=True)

    return index, chunks, vectorizer

