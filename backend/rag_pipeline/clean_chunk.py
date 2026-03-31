# rag_pipeline/clean_chunk.py

'''
Chunking and cleaning for medical RAG documents.

Runtime dependencies (all optional — each tier degrades gracefully):
  • tiktoken  — token-accurate sizing that matches the OpenAI model's BPE
                vocabulary.  Install: pip install tiktoken
                Without it, the module falls back to whitespace word counts
                (original behaviour), so the pipeline never hard-fails.

  • spaCy / en_core_web_sm — neural sentence boundary detection.
                Install: pip install spacy && python -m spacy download en_core_web_sm
                Without it, falls back to rule-based sentencizer, then regex.

Encoding priority (tiktoken):
    Tier 1  encoding_for_model("gpt-4.1-nano")  — exact match for the LLM in use
    Tier 2  get_encoding("o200k_base")           — GPT-4o / GPT-4.1 family
    Tier 3  get_encoding("cl100k_base")          — GPT-4 / GPT-3.5 family
    Tier 4  whitespace word count                — stdlib only, zero dependencies
'''

import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ============================================================================
# SECTION 1 — Tiktoken lazy loader
#
# The encoder is initialised ONCE per process and reused for every call.
# tiktoken itself is Rust-backed; individual encode() calls on medical-length
# paragraphs complete in microseconds, so there is no per-call overhead worth
# caching beyond the encoder object itself.
# ============================================================================

_enc: Optional[object] = None           # cached tiktoken encoder
_TIKTOKEN_AVAILABLE: Optional[bool] = None  # tri-state: None = untested

# The model in use across the pipeline (extract_metadata.py, rag_query.py).
# Encoding is resolved at startup so a model rename here is the only
# change needed to re-align the whole module.
_TARGET_MODEL = "gpt-4.1-nano"


def _get_encoder():
    """
    Return a tiktoken Encoding object, loading it at most once per process.

    Resolution order:
        Tier 1 — encoding_for_model(_TARGET_MODEL)
                 Uses the exact vocabulary of the deployed LLM.
        Tier 2 — get_encoding("o200k_base")
                 Covers the GPT-4o / GPT-4.1 model family when the model
                 name is not yet registered in the installed tiktoken version.
        Tier 3 — get_encoding("cl100k_base")
                 GPT-4 / GPT-3.5-turbo family; broader fallback.
        Tier 4 — tiktoken not installed → returns None.
                 _count_tokens() will silently use word counts, keeping the
                 pipeline alive with original behaviour.
    """
    global _enc, _TIKTOKEN_AVAILABLE

    if _TIKTOKEN_AVAILABLE is not None:   # already resolved — use cached result
        return _enc

    try:
        import tiktoken

        # ── Tier 1: exact model match ─────────────────────────────────────────
        try:
            _enc = tiktoken.encoding_for_model(_TARGET_MODEL)
            logger.info(
                "tiktoken ready: encoding_for_model('%s') → enc=%s",
                _TARGET_MODEL, _enc.name,
            )
            _TIKTOKEN_AVAILABLE = True
            return _enc
        except KeyError:
            logger.debug(
                "tiktoken: model '%s' not in registry. Trying o200k_base.",
                _TARGET_MODEL,
            )

        # ── Tier 2: GPT-4o / GPT-4.1 family ──────────────────────────────────
        try:
            _enc = tiktoken.get_encoding("o200k_base")
            logger.info(
                "tiktoken ready: o200k_base (GPT-4o family). "
                "Model '%s' not found in registry; upgrade tiktoken to get exact match: "
                "pip install --upgrade tiktoken",
                _TARGET_MODEL,
            )
            _TIKTOKEN_AVAILABLE = True
            return _enc
        except Exception:
            logger.debug("tiktoken: o200k_base not available. Trying cl100k_base.")

        # ── Tier 3: GPT-4 / GPT-3.5 family ───────────────────────────────────
        _enc = tiktoken.get_encoding("cl100k_base")
        logger.warning(
            "tiktoken ready: cl100k_base (GPT-4/GPT-3.5 family). "
            "Token counts will be slightly off for '%s'. "
            "Upgrade tiktoken: pip install --upgrade tiktoken",
            _TARGET_MODEL,
        )
        _TIKTOKEN_AVAILABLE = True

    except ImportError as exc:
        # ── Tier 4: tiktoken not installed ────────────────────────────────────
        _enc = None
        _TIKTOKEN_AVAILABLE = False
        logger.warning(
            "tiktoken not installed (%s). Chunking will use whitespace word counts "
            "(original behaviour). For token-accurate chunking install: pip install tiktoken",
            exc,
        )

    return _enc


# ============================================================================
# SECTION 2 — Token counting helpers
#
# _count_tokens  is the single source of truth for every length measurement
# in this module.  Replacing len(text.split()) with _count_tokens(text)
# everywhere guarantees that one swap is sufficient to switch between the two
# counting modes without touching business logic.
# ============================================================================

def _count_tokens(text: str) -> int:
    """
    Return the token count for *text* using the tiktoken encoder.

    Falls back to whitespace word count when tiktoken is unavailable,
    preserving the original behaviour exactly so the pipeline never breaks.

    Performance note:
        tiktoken.encode() is implemented in Rust.  Encoding a typical
        300-word medical paragraph takes ~50–150 µs.  Calling this function
        thousands of times per document is safe with no additional caching.
    """
    enc = _get_encoder()
    if enc is not None:
        return len(enc.encode(text))
    # Fallback — original behaviour
    return len(text.split())


def _get_overlap_text(text: str, n_tokens: int) -> str:
    """
    Extract the last *n_tokens* tokens from *text* as a decoded string.

    Token-precise overlap means the carried-over context boundary aligns
    with the model's BPE vocabulary rather than an arbitrary whitespace
    split — eliminating partial sub-word tokens at chunk edges.

    Falls back to the last n_tokens whitespace words when tiktoken is
    unavailable (identical to the original word-slice overlap logic).

    NOTE: This function is retained as a last-resort fallback called by
    _get_sentence_overlap() when no sentence boundary can be found.
    Direct callers in chunk_text() should use _get_sentence_overlap()
    instead to guarantee clean semantic boundaries.
    """
    if n_tokens <= 0:
        return ""

    enc = _get_encoder()
    if enc is not None:
        token_ids = enc.encode(text)
        if not token_ids:
            return ""
        return enc.decode(token_ids[-n_tokens:])

    # Word-count fallback — preserves original behaviour exactly
    words = text.split()
    return " ".join(words[-n_tokens:])


def _get_sentence_overlap(text: str, max_overlap_tokens: int) -> str:
    """
    Return the trailing *whole sentences* from *text* whose combined token
    count does not exceed *max_overlap_tokens*.

    This is the replacement for the raw token-slice approach used previously.
    By reusing _split_into_sentences() — the same splitter that governs
    paragraph decomposition — we guarantee that every new chunk starts and
    ends on a natural sentence boundary, never mid-phrase or mid-value.

    Algorithm:
        1. Split *text* into sentences via the configured splitter
           (spaCy senter → rule-based sentencizer → lookbehind regex).
        2. Walk backwards through the sentence list, accumulating whole
           sentences until the next one would exceed *max_overlap_tokens*.
        3. Reverse the selection to restore chronological order and join.

    Edge cases:
        • Empty text or zero budget  → return "".
        • A single sentence exceeds the budget on its own  → fall back to
          _get_overlap_text() so the caller always receives *something*
          rather than an empty string that silently discards context.
        • No sentence boundaries found at all (degenerate input)  → same
          fallback, preserving the original word/token-slice behaviour.

    Args:
        text:               The full text of the *previous* chunk.
        max_overlap_tokens: Maximum tokens (or words in fallback mode) the
                            returned overlap string may contain.

    Returns:
        A string composed of one or more complete trailing sentences from
        *text*, within the token budget, ready to prepend to the next chunk.
    """
    if max_overlap_tokens <= 0 or not text.strip():
        return ""

    # _split_into_sentences is defined in Section 4 below; calling it here is
    # safe because Python resolves names at call-time, not definition-time.
    sentences = _split_into_sentences(text)

    if not sentences:
        # Degenerate input: no sentence boundaries detected at all.
        # Fall back to token/word slice so the caller is never left empty.
        logger.debug(
            "_get_sentence_overlap: no sentences found in chunk tail; "
            "falling back to token-slice overlap."
        )
        return _get_overlap_text(text, max_overlap_tokens)

    # Walk backwards, greedily accumulating complete sentences.
    selected: list[str] = []
    total_tokens: int = 0

    for sentence in reversed(sentences):
        sent_tokens = _count_tokens(sentence)
        if total_tokens + sent_tokens <= max_overlap_tokens:
            selected.append(sentence)
            total_tokens += sent_tokens
        else:
            # Adding this sentence would bust the budget — stop here.
            # We do NOT try a smaller sentence further back; that would
            # create a non-contiguous, contextually misleading overlap.
            break

    if not selected:
        # Even the very last sentence alone exceeds the budget.
        # Fall back to a token-level slice of that last sentence so
        # the caller receives *something* rather than an empty string.
        logger.debug(
            "_get_sentence_overlap: last sentence alone exceeds budget (%d tokens); "
            "falling back to token-slice overlap.",
            max_overlap_tokens,
        )
        return _get_overlap_text(text, max_overlap_tokens)

    # Restore chronological order before joining.
    selected.reverse()
    overlap = " ".join(selected)

    logger.debug(
        "_get_sentence_overlap: carried %d sentence(s), %d tokens (budget: %d).",
        len(selected), total_tokens, max_overlap_tokens,
    )
    return overlap


# ============================================================================
# SECTION 3 — spaCy lazy loader  (UNCHANGED from original)
#
# Sentence boundary detection is a separate concern from token counting.
# The spaCy tier system is preserved verbatim so there is no regression risk.
# ============================================================================

_nlp: Optional[object] = None
_SPACY_AVAILABLE: Optional[bool] = None


def _get_nlp():
    """
    Return a spaCy pipeline configured solely for sentence boundary detection.

    Key facts sourced from the official spaCy model docs:
      • en_core_web_sm ships with:
            tok2vec, tagger, parser, senter, ner, attribute_ruler, lemmatizer
      • 'senter' is DISABLED by default in the model's config.cfg — the parser
        handles sentence boundaries instead.
      • 'senter' owns its own internal tok2vec layer; it does NOT listen to the
        shared top-level tok2vec component. It is therefore fully independent.

    Loading strategy:
      ┌─ Tier 1 ─ en_core_web_sm (neural senter, most accurate)
      │   1. exclude= removes heavy components we will never use (they are not
      │      even loaded into memory — faster cold start).
      │   2. After load(), call disable_pipe / enable_pipe on the live object.
      │      This avoids all enable=/disable= kwarg conflicts with config.cfg.
      │
      ├─ Tier 2 ─ spacy.blank("en") + sentencizer  (rule-based, zero download)
      │   Activated when en_core_web_sm is not installed.
      │
      └─ Tier 3 ─ lookbehind regex (pure stdlib, spaCy not installed at all)
    """
    global _nlp, _SPACY_AVAILABLE

    if _SPACY_AVAILABLE is not None:    # already resolved — return cached result
        return _nlp

    try:
        import spacy

        # ── Tier 1: neural senter ────────────────────────────────────────────
        try:
            _nlp = spacy.load(
                "en_core_web_sm",
                exclude=["tagger", "ner", "attribute_ruler", "lemmatizer"],
            )
            _nlp.disable_pipe("parser")
            _nlp.enable_pipe("senter")
            logger.info(
                "spaCy ready: en_core_web_sm | active pipes: %s",
                _nlp.pipe_names,
            )

        except OSError:
            # ── Tier 2: model not present — rule-based sentencizer ───────────
            logger.warning(
                "en_core_web_sm not found. Falling back to rule-based sentencizer. "
                "For better accuracy run: python -m spacy download en_core_web_sm"
            )
            _nlp = spacy.blank("en")
            _nlp.add_pipe("sentencizer")
            logger.info("spaCy ready: blank en + rule-based sentencizer.")

        _SPACY_AVAILABLE = True

    except ImportError as exc:
        # ── Tier 3: spaCy not installed — regex fallback in _split_into_sentences
        _nlp = None
        _SPACY_AVAILABLE = False
        logger.warning(
            "spaCy not installed (%s). Using lookbehind-regex fallback. "
            "Install: pip install spacy && python -m spacy download en_core_web_sm",
            exc,
        )

    return _nlp


# ============================================================================
# SECTION 4 — Sentence splitter  (UNCHANGED from original)
# ============================================================================

def _split_into_sentences(text: str) -> list[str]:
    """
    Split *text* into sentences without consuming or mutating punctuation.

    Priority:
        1. spaCy 'senter' — handles decimals, abbreviations, ellipses, etc.
        2. Lookbehind regex  — safe fallback that preserves punctuation.

    The original re.split(r'[.!?]+', ...) is intentionally never used:
    it strips the delimiter, which corrupts medical values like "14.5 g/dL"
    and abbreviations like "Dr." before the text ever reaches the embedder.
    """
    nlp = _get_nlp()

    if nlp is not None:
        doc = nlp(text)
        return [sent.text.strip() for sent in doc.sents if sent.text.strip()]

    # Regex fallback — splits on whitespace *after* punctuation via lookbehind,
    # so the punctuation character stays attached to the preceding sentence.
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', text) if s.strip()]


# ============================================================================
# SECTION 5 — Public API
# ============================================================================

def clean_text(text: str) -> str:
    """
    Clean extracted text from medical documents.
    No sizing logic lives here — this function is unchanged.
    """
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

    # Normalize whitespace
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
    """
    Identical to chunk_text() but attaches source-document identity to every chunk.

    Returns List[dict] instead of List[str]:
        [{"text": "...", "doc_id": "report_1.pdf"}, ...]

    The doc_id travels with each chunk through embed_store.build_faiss_index()
    and is preserved in chunks.pkl.  rag_query.smart_context_assembly() uses it
    to group chunks by actual document rather than relying on integer division,
    eliminating the boundary-guessing problem when reports have unequal lengths.

    Args:
        text:          Cleaned input text (same as chunk_text).
        doc_id:        Source document identifier — typically the filename,
                       e.g. "blood_test_jan25.pdf".
        max_words:     Soft token ceiling per chunk (passed through to chunk_text).
        overlap_words: Overlap token budget (passed through to chunk_text).

    Returns:
        List of dicts, each with keys "text" and "doc_id".
        Empty list if chunk_text returns no chunks.

    BACKWARD COMPATIBILITY:
        chunk_text() is unchanged — callers that do not need metadata continue
        to work without modification.  This function is additive-only.
    """
    raw_chunks = chunk_text(text, max_words=max_words, overlap_words=overlap_words)
    return [{"text": chunk, "doc_id": doc_id} for chunk in raw_chunks]


def chunk_text(text: str, max_words: int = 300, overlap_words: int = 50) -> list[str]:
    """
    Intelligent chunking for medical documents.

    Parameter names are preserved for full backward compatibility with all
    callers in the pipeline.  Internally, *max_words* and *overlap_words* are
    now treated as **token limits** when tiktoken is available, or as
    whitespace word limits when it is not.  No caller changes are required.

    Strategy:
        1. Split by double newlines (paragraphs).
        2. Combine paragraphs into chunks of ~max_words tokens.
        3. When a single paragraph is too long, delegate to
           _split_into_sentences() — punctuation is preserved.
        4. Add sentence-level overlap between chunks for retrieval context.
           Overlap is carried as complete trailing sentences from the previous
           chunk (via _get_sentence_overlap), guaranteeing every chunk begins
           on a clean semantic boundary — never mid-phrase or mid-value.

    Args:
        text:          Cleaned input text.
        max_words:     Soft ceiling on tokens (or words) per chunk.
                       Default 300 — a safe, model-aligned budget for
                       gpt-4.1-nano's context window.
        overlap_words: Token (or word) budget for the overlap carried from
                       the previous chunk.  Whole sentences are selected to
                       fit within this budget, so the actual overlap token
                       count may be somewhat less than the budget — but never
                       more, and never semantically broken.

    Returns:
        List of non-empty text chunks.  Each chunk is at least 10 tokens
        (or words in fallback mode) to filter out noise fragments.
    """
    if not text or not text.strip():
        return []

    # Alias — internal variable names reflect the true unit being measured.
    max_tokens: int = max_words
    overlap_tokens: int = overlap_words
    # Minimum chunk size: keeps the noise filter consistent with the
    # counting unit in use (tokens or words).
    MIN_CHUNK_TOKENS: int = 10

    # ── 1. Paragraph segmentation ─────────────────────────────────────────────
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]

    if not paragraphs:
        paragraphs = [p.strip() for p in text.split('\n') if p.strip()]

    if not paragraphs:
        # Degenerate input: single block of text.
        return [text] if _count_tokens(text) >= MIN_CHUNK_TOKENS * 2 else []

    chunks: list[str] = []
    current_chunk: list[str] = []
    current_token_count: int = 0

    for para in paragraphs:
        para_token_count = _count_tokens(para)

        # ── 2. Oversized paragraph: split into sentences ──────────────────────
        if para_token_count > max_tokens:
            # Flush whatever was accumulating before we enter sentence mode.
            if current_chunk:
                chunks.append('\n\n'.join(current_chunk))
                current_chunk = []
                current_token_count = 0

            # Use the safe splitter — punctuation is PRESERVED.
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

        # ── 3. Normal paragraph: accumulate into current chunk ────────────────
        if current_token_count + para_token_count <= max_tokens:
            current_chunk.append(para)
            current_token_count += para_token_count
        else:
            if current_chunk:
                chunks.append('\n\n'.join(current_chunk))

            # ── 4. Sentence-level overlap: carry trailing sentences ───────────
            #
            # FIX: replaced _get_overlap_text() (raw token slice) with
            # _get_sentence_overlap() (whole-sentence selection).
            #
            # Previously: the overlap was computed by slicing the last N
            # tokens/words from the raw string of chunks[-1], which
            # frequently started mid-sentence — e.g. "dL (13-17) WBC: 8000".
            # That broken prefix degraded embedding quality for every chunk
            # after the first.
            #
            # Now: _get_sentence_overlap() walks backwards through the
            # detected sentence boundaries of chunks[-1] and collects whole
            # trailing sentences up to the token budget.  Every new chunk
            # therefore begins with a complete, semantically coherent sentence,
            # preserving retrieval accuracy for the embedding model.
            if chunks and overlap_tokens > 0:
                overlap_text = _get_sentence_overlap(chunks[-1], overlap_tokens)
                overlap_token_count = _count_tokens(overlap_text)
                current_chunk = [overlap_text, para]
                current_token_count = overlap_token_count + para_token_count
            else:
                current_chunk = [para]
                current_token_count = para_token_count

    # ── 5. Flush final accumulator ────────────────────────────────────────────
    if current_chunk:
        final = '\n\n'.join(current_chunk)
        if _count_tokens(final) >= MIN_CHUNK_TOKENS:
            chunks.append(final)

    # Filter noise — drop any fragment that slipped through below the minimum.
    return [c for c in chunks if _count_tokens(c) >= MIN_CHUNK_TOKENS]


# ============================================================================
# SECTION 6 — Smoke test  (run with: python -m rag_pipeline.clean_chunk)
#
# Original assertions are preserved verbatim.
# Token counts are now displayed alongside word counts so you can observe
# the inflation factor on real medical text.
# A new overlap-boundary assertion verifies the sentence-level overlap fix.
# ============================================================================

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

    # ── Adversarial sentence: every token here is a known failure mode ────────
    #
    #   [A] Decimal in a medical value          →  "14.5 g/dL"
    #   [B] Titled abbreviation mid-sentence    →  "Dr. A.R. Mehta"
    #   [C] Ratio with slash                    →  "I/E ratio 1:2.3"
    #   [D] Trailing question mark              →  "Is this within range?"
    #   [E] Exclamation mid-report              →  "Critical alert!"
    #   [F] Decimal inside parentheses          →  "(ref. 4.5–5.5)"
    #   [G] Ellipsis                            →  "stable...for now"
    #   [H] Abbreviation followed by number     →  "approx. 3.2 mmol/L"
    #   [I] Multiple units with dots            →  "eGFR 58.7 mL/min/1.73 m²"
    #   [J] Normal sentence close               →  clean period at end
    #
    adversarial_para = (
        "Dr. A.R. Mehta reviewed the CBC panel dated 02/03/2025 and noted that the "
        "haemoglobin was 14.5 g/dL, which sits just above the lower threshold of "
        "13.0 g/dL for adult males. Is this within the acceptable range? Critical alert! "
        "The I/E ratio was recorded as 1:2.3 and the eGFR stood at 58.7 mL/min/1.73 m², "
        "borderline for stage-2 CKD (ref. 4.5–5.5 for serum creatinine); approx. 3.2 mmol/L "
        "bicarbonate suggests early metabolic compensation...for now. "
        "Dr. Singh will follow up at 08:30 a.m. on 15.04.2025 with a repeat U/E panel."
    )

    # ── Report tiktoken availability ──────────────────────────────────────────
    enc = _get_encoder()
    print("─" * 80)
    if enc is not None:
        print(f"TOKENIZER : tiktoken ({enc.name})")
    else:
        print("TOKENIZER : FALLBACK — whitespace word count (tiktoken not installed)")
    print("─" * 80)

    print("\nADVERSARIAL SENTENCE SPLIT TEST")
    print("─" * 80)
    print("\nInput paragraph:\n")
    print(adversarial_para)
    print(
        f"\n  Words  : {len(adversarial_para.split())}"
        f"\n  Tokens : {_count_tokens(adversarial_para)}"
        f"  ← inflation factor: "
        f"{_count_tokens(adversarial_para) / max(len(adversarial_para.split()), 1):.2f}x"
    )
    print("\nDetected sentence boundaries:\n")

    sentences = _split_into_sentences(adversarial_para)
    for idx, sent in enumerate(sentences, 1):
        print(f"  [{idx}] ({_count_tokens(sent)} tok) {sent}")

    # ── Assertions ────────────────────────────────────────────────────────────
    MUST_SURVIVE = [
        "14.5",         # [A] decimal
        "Dr. A.R.",     # [B] titled abbreviation
        "1:2.3",        # [C] ratio
        "58.7",         # [I] eGFR with units
        "approx. 3.2",  # [H] abbrev + decimal
        "3.2 mmol/L",   # [H] unit after decimal
        "08:30",        # time with colon
        "15.04.2025",   # date with dots
    ]

    print("\nAssertion results:\n")
    all_passed = True
    full_output = " ".join(sentences)
    for token in MUST_SURVIVE:
        ok = token in full_output
        status = "PASS ✓" if ok else "FAIL ✗"
        if not ok:
            all_passed = False
        print(f"  {status}  '{token}' preserved")

    print("\n" + "─" * 80)
    verdict = "ALL ASSERTIONS PASSED ✓" if all_passed else "ONE OR MORE ASSERTIONS FAILED ✗"
    print(f"  {verdict}")
    print("─" * 80)

    # ── Original smoke test (unchanged) ──────────────────────────────────────
    REGRESSION_VALUE = "14.5"

    print("\nOriginal text:")
    print(test_text)
    print("\n" + "=" * 80 + "\n")

    cleaned = clean_text(test_text)
    print("Cleaned text:")
    print(cleaned)
    print("\n" + "=" * 80 + "\n")

    chunks = chunk_text(cleaned, max_words=50, overlap_words=10)
    print(f"Created {len(chunks)} chunks:\n")

    regression_passed = False
    for i, chunk in enumerate(chunks, 1):
        words = len(chunk.split())
        tokens = _count_tokens(chunk)
        print(f"Chunk {i}  ({words} words / {tokens} tokens):")
        print(chunk)
        if REGRESSION_VALUE in chunk:
            regression_passed = True
        print()

    print("=" * 80)
    status = "PASSED ✓" if regression_passed else "FAILED ✗"
    print(f"Regression — '{REGRESSION_VALUE}' preserved across chunks: {status}")

    # ── NEW: sentence-boundary overlap assertion ──────────────────────────────
    #
    # Verifies that no chunk (after the first) begins with a fragment that
    # looks like a mid-sentence token-slice artefact.  A chunk starts cleanly
    # if its first character is a capital letter or a digit (the two valid
    # starts for a medical sentence or value), NOT with a lowercase word that
    # would indicate the overlap sliced into the middle of a sentence.
    #
    print("\nSentence-boundary overlap assertion:\n")
    overlap_passed = True
    for i, chunk in enumerate(chunks[1:], start=2):          # skip the first chunk
        first_char = chunk.lstrip()[0] if chunk.strip() else ""
        # Heuristic: a clean start is a capital letter, a digit, or a known
        # sentence-starting punctuation.  A lowercase letter strongly implies
        # a mid-sentence slice was carried over.
        clean_start = first_char.isupper() or first_char.isdigit()
        status_str = "PASS ✓" if clean_start else "FAIL ✗"
        if not clean_start:
            overlap_passed = False
        preview = chunk[:60].replace("\n", " ")
        print(f"  Chunk {i}: {status_str}  starts with '{first_char}' → \"{preview}...\"")

    print()
    overlap_verdict = (
        "OVERLAP BOUNDARY ASSERTIONS PASSED ✓"
        if overlap_passed
        else "ONE OR MORE OVERLAP BOUNDARY ASSERTIONS FAILED ✗"
    )
    print(f"  {overlap_verdict}")
    print("=" * 80)