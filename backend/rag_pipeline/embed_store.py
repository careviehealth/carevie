"""
Embedding and FAISS index layer for the medical RAG pipeline.
Uses sentence-transformers (all-MiniLM-L6-v2) for dense 384-d embeddings.
"""

import os
import pickle
import numpy as np
import faiss
from typing import List

from sentence_transformers import SentenceTransformer

EMBEDDING_DIM = 384
_MODEL_NAME   = "all-MiniLM-L6-v2"

class _DenseMatrix:
    """Wraps a float32 ndarray to expose the sklearn .toarray() interface."""

    def __init__(self, array: np.ndarray):
        self._array = np.asarray(array, dtype='float32')

    def toarray(self) -> np.ndarray:
        return self._array

class SentenceTransformerVectorizer:
    """Sentence-transformer wrapper with an sklearn-compatible interface."""

    def __init__(self, model_name: str = _MODEL_NAME):
        self.model_name = model_name
        self._model: SentenceTransformer | None = None

    def _get_model(self) -> SentenceTransformer:
        if self._model is None:
            print(f"   🤖 Loading sentence-transformer: {self.model_name} (device: cpu)", flush=True)
            # Force CPU to avoid CUDA capability mismatch on older GPUs (e.g., sm_61)
            self._model = SentenceTransformer(self.model_name, device="cpu")
        return self._model

    def fit_transform(self, texts: List[str]) -> _DenseMatrix:
        return self._encode(texts)

    def transform(self, texts: List[str]) -> _DenseMatrix:
        return self._encode(texts)

    def _encode(self, texts: List[str]) -> _DenseMatrix:
        model = self._get_model()
        # normalize_embeddings=False since FAISS normalize_L2 handles normalisation
        embeddings = model.encode(
            texts,
            normalize_embeddings=False,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return _DenseMatrix(embeddings.astype('float32'))

    def __getstate__(self):
        # Drop the live model; only the name is needed to reconstruct it post-unpickle
        return {'model_name': self.model_name}

    def __setstate__(self, state):
        self.model_name = state['model_name']
        self._model = None

def create_vectorizer() -> SentenceTransformerVectorizer:
    return SentenceTransformerVectorizer(_MODEL_NAME)

def embed_texts(texts: List[str], vectorizer=None) -> tuple:
    """Embed a list of text chunks into 384-d float32 vectors."""
    print(f"\n📊 Embedding {len(texts)} chunks...", flush=True)

    valid_texts = [t.strip() for t in texts if t and t.strip()]

    if not valid_texts:
        raise ValueError("All chunks are empty!")

    print(f"   Valid chunks: {len(valid_texts)}", flush=True)

    if vectorizer is None:
        vectorizer = create_vectorizer()

    try:
        print("   🔧 Encoding with sentence-transformer...", flush=True)

        embeddings_matrix = vectorizer.fit_transform(valid_texts).toarray()

        # Ensure model returns exactly EMBEDDING_DIM dimensions
        assert embeddings_matrix.shape[1] == EMBEDDING_DIM, (
            f"Model returned {embeddings_matrix.shape[1]}-d vectors; "
            f"expected {EMBEDDING_DIM}. Check model name."
        )

        print(f"   ✅ Embeddings shape: {embeddings_matrix.shape}", flush=True)

        embeddings = list(embeddings_matrix)
        return embeddings, vectorizer

    except Exception as e:
        print(f"   ❌ Embedding failed: {e}", flush=True)
        raise

def build_faiss_index(chunks: List[dict], temp_dir: str) -> tuple:
    """Build a FAISS IndexFlatIP from metadata-aware chunks and persist to temp_dir."""
    if not chunks:
        raise ValueError("No chunks provided to index")

    print(f"\n🔧 Building FAISS index...", flush=True)
    print(f"   Chunks: {len(chunks)}", flush=True)

    texts = [c["text"] for c in chunks]
    embeddings, vectorizer = embed_texts(texts)

    embedding_matrix = np.stack(embeddings)
    dim = embedding_matrix.shape[1]

    print(f"   Dimensions: {dim}", flush=True)
    print(f"   Matrix shape: {embedding_matrix.shape}", flush=True)

    if dim != EMBEDDING_DIM:
        raise ValueError(f"Dimension mismatch! Expected {EMBEDDING_DIM}, got {dim}")

    # Normalise for cosine similarity via inner product
    print("   🔧 Normalizing vectors...", flush=True)
    faiss.normalize_L2(embedding_matrix)

    print("   🔧 Creating FAISS index...", flush=True)
    index = faiss.IndexFlatIP(dim)
    index.add(embedding_matrix)
    print(f"   ✅ Index created: {index.ntotal} vectors", flush=True)

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
    """Load FAISS index, chunks and vectorizer from temp_dir."""
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