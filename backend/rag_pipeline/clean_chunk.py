"""
Chunking and cleaning for medical RAG documents.

Runtime dependencies:
  • tiktoken (optional): For model-aligned token sizing.
  • spaCy / en_core_web_sm (optional): For neural sentence boundary detection.
"""

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_enc: Optional[object] = None
_TIKTOKEN_AVAILABLE: Optional[bool] = None
_TARGET_MODEL = "gpt-4.1-nano"


def _get_encoder():
    """Return a tiktoken Encoding object, resolving fallbacks if necessary."""
    global _enc, _TIKTOKEN_AVAILABLE

    if _TIKTOKEN_AVAILABLE is not None:
        return _enc

    try:
        import tiktoken

        # Tier 1: Exact model match
        try:
            _enc = tiktoken.encoding_for_model(_TARGET_MODEL)
            logger.info(
                "tiktoken ready: encoding_for_model('%s') → enc=%s",
                _TARGET_MODEL, _enc.name,
            )
            _TIKTOKEN_AVAILABLE = True
            return _enc
        except KeyError:
            logger.debug("tiktoken: model '%s' not in registry.", _TARGET_MODEL)

        # Tier 2: GPT-4o / GPT-4.1 family fallback
        try:
            _enc = tiktoken.get_encoding("o200k_base")
            logger.info("tiktoken ready: o200k_base (GPT-4o family).")
            _TIKTOKEN_AVAILABLE = True
            return _enc
        except Exception:
            logger.debug("tiktoken: o200k_base not available.")

        # Tier 3: GPT-4 / GPT-3.5 family fallback
        _enc = tiktoken.get_encoding("cl100k_base")
        logger.warning("tiktoken ready: cl100k_base (GPT-4/GPT-3.5 family).")
        _TIKTOKEN_AVAILABLE = True

    except ImportError as exc:
        # Tier 4: No tiktoken installed, fallback to whitespace counts
        _enc = None
        _TIKTOKEN_AVAILABLE = False
        logger.warning("tiktoken not installed (%s). Using whitespace word counts.", exc)

    return _enc


def _count_tokens(text: str) -> int:
    """Return token count using tiktoken, falling back to word count if unavailable."""
    enc = _get_encoder()
    if enc is not None:
        return len(enc.encode(text))
    return len(text.split())


def _get_overlap_text(text: str, n_tokens: int) -> str:
    """Extract the last n_tokens tokens from text as a decoded string (fallback method)."""
    if n_tokens <= 0:
        return ""

    enc = _get_encoder()
    if enc is not None:
        token_ids = enc.encode(text)
        if not token_ids:
            return ""
        return enc.decode(token_ids[-n_tokens:])

    words = text.split()
    return " ".join(words[-n_tokens:])


def _get_sentence_overlap(text: str, max_overlap_tokens: int) -> str:
    """
    Return the trailing whole sentences from text within the max_overlap_tokens budget.
    """
    if max_overlap_tokens <= 0 or not text.strip():
        return ""

    sentences = _split_into_sentences(text)

    if not sentences:
        logger.debug("_get_sentence_overlap: no sentences found; using token-slice overlap.")
        return _get_overlap_text(text, max_overlap_tokens)

    selected: list[str] = []
    total_tokens: int = 0

    # Greedily accumulate whole sentences from the end
    for sentence in reversed(sentences):
        sent_tokens = _count_tokens(sentence)
        if total_tokens + sent_tokens <= max_overlap_tokens:
            selected.append(sentence)
            total_tokens += sent_tokens
        else:
            break

    if not selected:
        logger.debug("_get_sentence_overlap: single trailing sentence exceeds budget.")
        return _get_overlap_text(text, max_overlap_tokens)

    selected.reverse()
    overlap = " ".join(selected)

    logger.debug(
        "_get_sentence_overlap: carried %d sentence(s), %d tokens.",
        len(selected), total_tokens
    )
    return overlap


_nlp: Optional[object] = None
_SPACY_AVAILABLE: Optional[bool] = None


def _get_nlp():
    """Return a spaCy pipeline configured for sentence boundary detection."""
    global _nlp, _SPACY_AVAILABLE

    if _SPACY_AVAILABLE is not None:
        return _nlp

    try:
        import spacy

        # Tier 1: Neural senter
        try:
            _nlp = spacy.load(
                "en_core_web_sm",
                exclude=["tagger", "ner", "attribute_ruler", "lemmatizer"],
            )
            _nlp.disable_pipe("parser")
            _nlp.enable_pipe("senter")
            logger.info("spaCy ready: en_core_web_sm | active pipes: %s", _nlp.pipe_names)

        except OSError:
            # Tier 2: Rule-based sentencizer
            _nlp = spacy.blank("en")
            _nlp.add_pipe("sentencizer")
            logger.info("spaCy ready: blank en + rule-based sentencizer.")

        _SPACY_AVAILABLE = True

    except ImportError as exc:
        # Tier 3: Regex fallback
        _nlp = None
        _SPACY_AVAILABLE = False
        logger.warning("spaCy not installed (%s). Using lookbehind-regex fallback.", exc)

    return _nlp


def _split_into_sentences(text: str) -> list[str]:
    """Split text into sentences, preserving medical values and punctuation."""
    nlp = _get_nlp()

    if nlp is not None:
        doc = nlp(text)
        return [sent.text.strip() for sent in doc.sents if sent.text.strip()]

    # Regex fallback: split on whitespace after punctuation
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]


def clean_text(text: str) -> str:
    """Clean common noise patterns and normalize whitespace from medical documents."""
    if not text:
        return ""

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

    text = text.replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def chunk_text_with_metadata(
    text: str,
    doc_id: str,
    max_words: int = 300,
    overlap_words: int = 50,
) -> list[dict]:
    """Wrapper for chunk_text that attaches the source document ID to each chunk."""
    raw_chunks = chunk_text(text, max_words=max_words, overlap_words=overlap_words)
    return [{"text": chunk, "doc_id": doc_id} for chunk in raw_chunks]


def chunk_text(text: str, max_words: int = 300, overlap_words: int = 50) -> list[str]:
    """
    Split text into token-aware chunks, preserving natural sentence boundaries
    and ensuring semantic overlap context.
    """
    if not text or not text.strip():
        return []

    max_tokens: int = max_words
    overlap_tokens: int = overlap_words
    MIN_CHUNK_TOKENS: int = 10

    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]

    if not paragraphs:
        paragraphs = [p.strip() for p in text.split('\n') if p.strip()]

    if not paragraphs:
        return [text] if _count_tokens(text) >= MIN_CHUNK_TOKENS * 2 else []

    chunks: list[str] = []
    current_chunk: list[str] = []
    current_token_count: int = 0

    for para in paragraphs:
        para_token_count = _count_tokens(para)

        # Handle oversized paragraphs by falling back to sentence-level splitting
        if para_token_count > max_tokens:
            if current_chunk:
                chunks.append('\n\n'.join(current_chunk))
                current_chunk = []
                current_token_count = 0

            sentences = _split_into_sentences(para)
            temp_chunk: list[str] = []
            temp_count: int = 0

            for sentence in sentences:
                if not sentence:
                    continue

                sent_token_count = _count_tokens(sentence)

                if temp_count + sent_token_count <= max_tokens:
                    temp_chunk.append(sentence)
                    temp_count += sent_token_count
                else:
                    if temp_chunk:
                        chunks.append(' '.join(temp_chunk))
                    temp_chunk = [sentence]
                    temp_count = sent_token_count

            if temp_chunk:
                chunks.append(' '.join(temp_chunk))
            continue

        # Accumulate normal paragraphs
        if current_token_count + para_token_count <= max_tokens:
            current_chunk.append(para)
            current_token_count += para_token_count
        else:
            if current_chunk:
                chunks.append('\n\n'.join(current_chunk))

            # Start new chunk with trailing sentence overlap from previous text
            if chunks and overlap_tokens > 0:
                overlap_text = _get_sentence_overlap(chunks[-1], overlap_tokens)
                overlap_token_count = _count_tokens(overlap_text)
                current_chunk = [overlap_text, para]
                current_token_count = overlap_token_count + para_token_count
            else:
                current_chunk = [para]
                current_token_count = para_token_count

    if current_chunk:
        final = '\n\n'.join(current_chunk)
        if _count_tokens(final) >= MIN_CHUNK_TOKENS:
            chunks.append(final)

    return [c for c in chunks if _count_tokens(c) >= MIN_CHUNK_TOKENS]


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

    adversarial_para = (
        "Dr. A.R. Mehta reviewed the CBC panel dated 02/03/2025 and noted that the "
        "haemoglobin was 14.5 g/dL, which sits just above the lower threshold of "
        "13.0 g/dL for adult males. Is this within the acceptable range? Critical alert! "
        "The I/E ratio was recorded as 1:2.3 and the eGFR stood at 58.7 mL/min/1.73 m², "
        "borderline for stage-2 CKD (ref. 4.5–5.5 for serum creatinine); approx. 3.2 mmol/L "
        "bicarbonate suggests early metabolic compensation...for now. "
        "Dr. Singh will follow up at 08:30 a.m. on 15.04.2025 with a repeat U/E panel."
    )

    enc = _get_encoder()
    print("─" * 80)
    print(f"TOKENIZER : {'tiktoken (' + enc.name + ')' if enc else 'FALLBACK (whitespace)'}")
    print("─" * 80)

    print("\nADVERSARIAL SENTENCE SPLIT TEST")
    print("─" * 80)
    print(f"\nInput paragraph:\n{adversarial_para}")
    
    words = len(adversarial_para.split())
    tokens = _count_tokens(adversarial_para)
    inflation = tokens / max(words, 1)
    
    print(f"\n  Words  : {words}\n  Tokens : {tokens}  ← inflation factor: {inflation:.2f}x")
    print("\nDetected sentence boundaries:\n")

    sentences = _split_into_sentences(adversarial_para)
    for idx, sent in enumerate(sentences, 1):
        print(f"  [{idx}] ({_count_tokens(sent)} tok) {sent}")

    MUST_SURVIVE = [
        "14.5", "Dr. A.R.", "1:2.3", "58.7", 
        "approx. 3.2", "3.2 mmol/L", "08:30", "15.04.2025"
    ]

    print("\nAssertion results:\n")
    all_passed = True
    full_output = " ".join(sentences)
    
    for token in MUST_SURVIVE:
        ok = token in full_output
        status = "PASS ✓" if ok else "FAIL ✗"
        if not ok: all_passed = False
        print(f"  {status}  '{token}' preserved")

    print("\n" + "─" * 80)
    print(f"  {'ALL ASSERTIONS PASSED ✓' if all_passed else 'ONE OR MORE ASSERTIONS FAILED ✗'}")
    print("─" * 80)

    REGRESSION_VALUE = "14.5"
    cleaned = clean_text(test_text)
    chunks = chunk_text(cleaned, max_words=50, overlap_words=10)
    
    regression_passed = False
    print(f"\nCreated {len(chunks)} chunks:\n")
    for i, chunk in enumerate(chunks, 1):
        print(f"Chunk {i}  ({len(chunk.split())} words / {_count_tokens(chunk)} tokens):\n{chunk}\n")
        if REGRESSION_VALUE in chunk:
            regression_passed = True

    print("=" * 80)
    print(f"Regression — '{REGRESSION_VALUE}' preserved across chunks: {'PASSED ✓' if regression_passed else 'FAILED ✗'}")

    print("\nSentence-boundary overlap assertion:\n")
    overlap_passed = True
    
    for i, chunk in enumerate(chunks[1:], start=2):
        first_char = chunk.lstrip()[0] if chunk.strip() else ""
        clean_start = first_char.isupper() or first_char.isdigit()
        if not clean_start: overlap_passed = False
        
        status_str = "PASS ✓" if clean_start else "FAIL ✗"
        preview = chunk[:60].replace("\n", " ")
        print(f"  Chunk {i}: {status_str}  starts with '{first_char}' → \"{preview}...\"")

    print(f"\n  {'OVERLAP BOUNDARY ASSERTIONS PASSED ✓' if overlap_passed else 'ONE OR MORE OVERLAP BOUNDARY ASSERTIONS FAILED ✗'}")
    print("=" * 80)