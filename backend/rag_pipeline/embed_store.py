# backend/rag_pipeline/embed_store.py

import os
import pickle
import numpy as np
import faiss
from typing import List
from sklearn.feature_extraction.text import TfidfVectorizer


# Fixed dimension for consistency
EMBEDDING_DIM = 384

def create_vectorizer():
    """Create TF-IDF vectorizer with FIXED dimensions"""
    return TfidfVectorizer(
        max_features=EMBEDDING_DIM,  # Fixed dimension
        ngram_range=(1, 2),
        min_df=1,
        max_df=1.0,
        stop_words=None,
        token_pattern=r'\b\w+\b',
        lowercase=True
    )


def embed_texts(texts: List[str], vectorizer=None) -> tuple:
    """
    Create TF-IDF embeddings with FIXED dimensions
    Returns: (embeddings, fitted_vectorizer)
    """
    print(f"\n📊 Embedding {len(texts)} chunks...", flush=True)
    
    # Filter empty texts
    valid_texts = [t.strip() for t in texts if t and t.strip()]
    
    if not valid_texts:
        raise ValueError("All chunks are empty!")
    
    print(f"   Valid chunks: {len(valid_texts)}", flush=True)
    
    # Check vocabulary
    total_words = sum(len(t.split()) for t in valid_texts)
    unique_words = len(set(' '.join(valid_texts).split()))
    
    print(f"   Total words: {total_words}", flush=True)
    print(f"   Unique words: {unique_words}", flush=True)
    
    # Create or use provided vectorizer
    if vectorizer is None:
        vectorizer = create_vectorizer()
    
    try:
        print("   🔧 Fitting vectorizer...", flush=True)
        
        # Fit and transform - will always be EMBEDDING_DIM dimensions
        embeddings_matrix = vectorizer.fit_transform(valid_texts).toarray()
        
        print(f"   ✅ Embeddings shape: {embeddings_matrix.shape}", flush=True)
        
        # Ensure exactly EMBEDDING_DIM dimensions
        if embeddings_matrix.shape[1] < EMBEDDING_DIM:
            # Pad with zeros if needed
            padding = np.zeros((embeddings_matrix.shape[0], EMBEDDING_DIM - embeddings_matrix.shape[1]))
            embeddings_matrix = np.hstack([embeddings_matrix, padding])
            print(f"   ⚠️  Padded to {EMBEDDING_DIM} dimensions", flush=True)
        
        # Convert to list of vectors
        embeddings = [emb.astype('float32') for emb in embeddings_matrix]
        
        return embeddings, vectorizer
        
    except Exception as e:
        print(f"   ❌ Embedding failed: {e}", flush=True)
        raise


def build_faiss_index(chunks: List[str], temp_dir: str) -> tuple:
    """
    Build FAISS index from text chunks IN MEMORY
    
    Args:
        chunks: List of text chunks
        temp_dir: Temporary directory for this request
    
    Returns:
        (index, chunks, vectorizer) - all in memory
    """
    if not chunks:
        raise ValueError("No chunks provided to index")
    
    print(f"\n🔧 Building FAISS index...", flush=True)
    print(f"   Chunks: {len(chunks)}", flush=True)
    
    # Create embeddings
    try:
        embeddings, vectorizer = embed_texts(chunks)
    except Exception as e:
        print(f"❌ Failed to create embeddings: {e}", flush=True)
        raise
    
    # Stack into matrix
    embedding_matrix = np.stack(embeddings)
    dim = embedding_matrix.shape[1]
    
    print(f"   Dimensions: {dim}", flush=True)
    print(f"   Matrix shape: {embedding_matrix.shape}", flush=True)
    
    # Verify dimension
    if dim != EMBEDDING_DIM:
        raise ValueError(f"Dimension mismatch! Expected {EMBEDDING_DIM}, got {dim}")
    
    # Normalize for cosine similarity
    print(f"   🔧 Normalizing vectors...", flush=True)
    faiss.normalize_L2(embedding_matrix)
    
    # Create FAISS index
    print(f"   🔧 Creating FAISS index...", flush=True)
    index = faiss.IndexFlatIP(dim)
    index.add(embedding_matrix)
    
    print(f"   ✅ Index created: {index.ntotal} vectors", flush=True)
    
    # Save to temp directory (for this request only)
    index_path = os.path.join(temp_dir, "index.faiss")
    chunks_path = os.path.join(temp_dir, "chunks.pkl")
    vectorizer_path = os.path.join(temp_dir, "vectorizer.pkl")
    
    faiss.write_index(index, index_path)
    
    with open(chunks_path, "wb") as f:
        pickle.dump(chunks, f)
    
    with open(vectorizer_path, "wb") as f:
        pickle.dump(vectorizer, f)
    
    print(f"   ✅ Saved to temp: {temp_dir}", flush=True)
    print("✅ FAISS index built successfully!", flush=True)
    
    # Return in-memory objects
    return index, chunks, vectorizer


def load_index_and_chunks(temp_dir: str):
    """Load FAISS index and chunks from temp directory"""
    print(f"\n📂 Loading from temp: {temp_dir}...", flush=True)
    
    index_path = os.path.join(temp_dir, "index.faiss")
    chunks_path = os.path.join(temp_dir, "chunks.pkl")
    vectorizer_path = os.path.join(temp_dir, "vectorizer.pkl")
    
    if not os.path.exists(index_path):
        raise FileNotFoundError(f"Index not found: {index_path}")
    if not os.path.exists(chunks_path):
        raise FileNotFoundError(f"Chunks not found: {chunks_path}")
    if not os.path.exists(vectorizer_path):
        raise FileNotFoundError(f"Vectorizer not found: {vectorizer_path}")
    
    # Load index
    index = faiss.read_index(index_path)
    print(f"   ✅ Index loaded: {index.ntotal} vectors", flush=True)
    
    # Load chunks
    with open(chunks_path, "rb") as f:
        chunks = pickle.load(f)
    print(f"   ✅ Chunks loaded: {len(chunks)} chunks", flush=True)
    
    # Load vectorizer
    with open(vectorizer_path, "rb") as f:
        vectorizer = pickle.load(f)
    print(f"   ✅ Vectorizer loaded", flush=True)
    
    return index, chunks, vectorizer


def search_similar(query: str, temp_dir: str, top_k: int = 5):
    """Search for similar chunks using temp directory"""
    # Load from temp
    index, chunks, vectorizer = load_index_and_chunks(temp_dir)
    
    # Embed query using SAME vectorizer
    try:
        query_embedding = vectorizer.transform([query]).toarray()[0].astype('float32')
        
        # Ensure correct dimension
        if len(query_embedding) < EMBEDDING_DIM:
            padding = np.zeros(EMBEDDING_DIM - len(query_embedding), dtype='float32')
            query_embedding = np.concatenate([query_embedding, padding])
        
        query_embedding = query_embedding.reshape(1, -1)
        faiss.normalize_L2(query_embedding)
        
    except Exception as e:
        print(f"❌ Query embedding failed: {e}", flush=True)
        raise
    
    # Search
    scores, indices = index.search(query_embedding, min(top_k, len(chunks)))
    
    # Return results
    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < len(chunks):
            results.append((chunks[idx], float(score)))
    
    return results