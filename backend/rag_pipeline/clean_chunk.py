# rag_pipeline/clean_chunk.py

import re


def clean_text(text: str) -> str:
    """
    Clean extracted text
    """
    if not text:
        return ""
    
    # Remove common noise
    noise_patterns = [
        r"scan to validate.*",
        r"page\s*\d+\s*of\s*\d+",
        r"barcode id.*",
        r"end of report.*",
        r"={5,}",
        r"-{5,}",
    ]
    
    for pattern in noise_patterns:
        text = re.sub(pattern, "", text, flags=re.I)
    
    # Normalize whitespace
    text = text.replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    
    return text.strip()


def chunk_text(text: str, max_words: int = 300, overlap_words: int = 50) -> list:
    """
    Intelligent chunking for medical documents
    
    Strategy:
    1. Split by double newlines (paragraphs)
    2. Combine paragraphs into chunks of ~max_words
    3. Add overlap between chunks for context
    
    Args:
        text: Text to chunk
        max_words: Maximum words per chunk
        overlap_words: Words to overlap between chunks
    
    Returns:
        List of text chunks
    """
    if not text or not text.strip():
        return []
    
    # Split into paragraphs
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    
    if not paragraphs:
        # Fallback: split by single newlines
        paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
    
    if not paragraphs:
        # Last resort: return whole text if it has enough words
        words = text.split()
        if len(words) >= 20:
            return [text]
        else:
            return []
    
    chunks = []
    current_chunk = []
    current_word_count = 0
    
    for para in paragraphs:
        para_words = para.split()
        para_word_count = len(para_words)
        
        # If single paragraph is too long, split it
        if para_word_count > max_words:
            # Save current chunk first
            if current_chunk:
                chunks.append('\n\n'.join(current_chunk))
                current_chunk = []
                current_word_count = 0
            
            # Split long paragraph into sentences
            sentences = re.split(r'[.!?]+', para)
            temp_chunk = []
            temp_count = 0
            
            for sentence in sentences:
                sentence = sentence.strip()
                if not sentence:
                    continue
                
                sent_words = len(sentence.split())
                
                if temp_count + sent_words <= max_words:
                    temp_chunk.append(sentence)
                    temp_count += sent_words
                else:
                    if temp_chunk:
                        chunks.append('. '.join(temp_chunk) + '.')
                    temp_chunk = [sentence]
                    temp_count = sent_words
            
            if temp_chunk:
                chunks.append('. '.join(temp_chunk) + '.')
            
            continue
        
        # Add paragraph to current chunk
        if current_word_count + para_word_count <= max_words:
            current_chunk.append(para)
            current_word_count += para_word_count
        else:
            # Save current chunk and start new one
            if current_chunk:
                chunks.append('\n\n'.join(current_chunk))
            
            # Add overlap from previous chunk
            if chunks and overlap_words > 0:
                prev_words = chunks[-1].split()[-overlap_words:]
                overlap_text = ' '.join(prev_words)
                current_chunk = [overlap_text, para]
                current_word_count = len(prev_words) + para_word_count
            else:
                current_chunk = [para]
                current_word_count = para_word_count
    
    # Add final chunk
    if current_chunk:
        chunk_text = '\n\n'.join(current_chunk)
        # Only add if it has enough content
        if len(chunk_text.split()) >= 10:
            chunks.append(chunk_text)
    
    # Filter out very short chunks
    chunks = [c for c in chunks if len(c.split()) >= 10]
    
    return chunks


# Test function
if __name__ == "__main__":
    test_text = """
    Patient Name: John Doe
    Age: 45 years
    Date: 15/01/2025
    
    COMPLETE BLOOD COUNT
    Hemoglobin: 14.5 g/dL (13-17)
    WBC: 8000 /cumm (4000-11000)
    Platelets: 250000 /cumm (150000-450000)
    
    INTERPRETATION:
    All values within normal range.
    No abnormalities detected.
    
    FOLLOW UP:
    Repeat test after 6 months if symptoms persist.
    Maintain healthy diet and exercise.
    """
    
    print("Original text:")
    print(test_text)
    print("\n" + "="*80 + "\n")
    
    cleaned = clean_text(test_text)
    print("Cleaned text:")
    print(cleaned)
    print("\n" + "="*80 + "\n")
    
    chunks = chunk_text(cleaned, max_words=50, overlap_words=10)
    print(f"Created {len(chunks)} chunks:")
    for i, chunk in enumerate(chunks, 1):
        print(f"\nChunk {i}:")
        print(chunk)
        print(f"({len(chunk.split())} words)")