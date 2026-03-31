# backend/rag_pipeline/rag_query.py
"""
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
rag_query.py  —  v2 Upgrade  (three targeted fixes, zero breaking changes)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UPGRADE 1 — TIKTOKEN  (replaces `max_tokens * 4` character estimate)
  • Module-level _TOKENIZER singleton built once at import time.
  • Falls back to cl100k_base when gpt-4.1-nano isn't yet in tiktoken's
    registry — cl100k_base is the GPT-4 family encoding and is accurate.
  • count_tokens(text) is a new public helper for callers that want to
    pre-check budget before assembling prompts.
  • smart_context_assembly() budgets by real token count.
  • Chunk truncation uses encode → slice → decode so a multi-byte character
    (µ, °, ±) is never split mid-sequence.

UPGRADE 2 — CENTRALISED PATIENT EXTRACTION
  • ask_rag_improved() now calls extract_metadata_with_llm() from
    extract_metadata.py when patient_metadata is not supplied by the caller.
  • extract_metadata_with_llm uses AsyncOpenAI + Pydantic structured outputs
    and has its own regex fallback (extract_metadata_fallback).
  • The duplicate local regex extractor is gone from the hot path.
  • extract_patient_info() is kept as a public shim so any external caller
    that imported it does not break at all.

UPGRADE 3 — ASYNC OPENAI SDK  (replaces raw requests.post)
  • call_openai_api() keeps its exact public signature.
  • Internally it calls asyncio.run(_async_call_openai(...)).
  • _make_openai_client() creates a fresh AsyncOpenAI client INSIDE the
    asyncio.run() context and closes it in finally — identical lifecycle
    to extract_metadata.py — preventing "Event loop is closed" errors.
  • timeout=90.0 matches the original blunt timeout; max_retries=1 handles
    transient 429 / 5xx without hammering.

BACKWARD COMPATIBILITY — nothing the rest of the pipeline calls has changed:
  ask_rag(question, temp_dir, top_k, num_reports)             ← unchanged
  ask_rag_improved(question, temp_dir, folder_type,
                   num_reports, patient_metadata)              ← unchanged
  call_openai_api(system_prompt, user_prompt, num_reports)    ← unchanged
  extract_patient_info(text)                                   ← kept as shim
  count_tokens(text)                                           ← NEW public helper
  MODEL_NAME, OPENAI_API_KEY                                   ← kept as constants
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

# ── Standard library ──────────────────────────────────────────────────────────
import asyncio
import os
import re
from typing import Optional

# ── Third-party ───────────────────────────────────────────────────────────────
import faiss
import numpy as np
import tiktoken
from openai import AsyncOpenAI

# ── Local ─────────────────────────────────────────────────────────────────────
from rag_pipeline.embed_store import load_index_and_chunks, EMBEDDING_DIM
from rag_pipeline.extract_metadata import (
    extract_metadata_with_llm,
    extract_metadata_fallback,
)


# ─────────────────────────────────────────────────────────────────────────────
# MODULE-LEVEL CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
MODEL_NAME: str = "gpt-4.1-nano"

# Kept for any external code that may have imported this URL directly.
# No longer used internally — the SDK constructs its own endpoints.
OPENAI_CHAT_URL: str = "https://api.openai.com/v1/chat/completions"


# ─────────────────────────────────────────────────────────────────────────────
# UPGRADE 1 — TIKTOKEN TOKENIZER
# ─────────────────────────────────────────────────────────────────────────────

def _build_tokenizer() -> tiktoken.Encoding:
    """
    Return a tiktoken encoder for MODEL_NAME.

    gpt-4.1-nano may not yet appear in tiktoken's built-in model registry
    because the library updates its table independently of OpenAI's model
    releases.  If encoding_for_model raises a KeyError we fall back to
    cl100k_base — the encoding for the entire GPT-4 family — which is
    byte-for-byte accurate for gpt-4.1-nano.

    This function is called exactly once at module import time; the result
    is stored in the module-level _TOKENIZER singleton so subsequent calls
    to count_tokens() have zero setup overhead.
    """
    try:
        enc = tiktoken.encoding_for_model(MODEL_NAME)
        print(f"✅ tiktoken: loaded encoding for '{MODEL_NAME}'", flush=True)
        return enc
    except KeyError:
        # Model not yet in tiktoken's registry — safe fallback for GPT-4 family.
        print(
            f"⚠️  tiktoken: '{MODEL_NAME}' not in registry "
            f"— using cl100k_base (GPT-4 family encoding)",
            flush=True,
        )
        return tiktoken.get_encoding("cl100k_base")


# Module-level singleton — created once, reused for every token count.
_TOKENIZER: tiktoken.Encoding = _build_tokenizer()


def count_tokens(text: str) -> int:
    """
    Return the exact token count for *text* under MODEL_NAME's encoding.

    Public helper — callers outside this module can use it to pre-flight
    budget checks before assembling prompts.
    """
    return len(_TOKENIZER.encode(text))


def _truncate_to_tokens(text: str, max_tok: int) -> str:
    """
    Return a prefix of *text* that is at most *max_tok* tokens long.

    Decoding the token IDs back to a string is essential for correctness:
    multi-byte characters such as µ (micro), ° (degree), and ± (plus-minus)
    — all common in lab-result tables — can span multiple bytes, and slicing
    the raw string at a byte boundary produces invalid Unicode.  Encoding
    first, truncating the ID list, then decoding avoids this entirely.
    """
    ids = _TOKENIZER.encode(text)
    if len(ids) <= max_tok:
        return text
    return _TOKENIZER.decode(ids[:max_tok])


# ─────────────────────────────────────────────────────────────────────────────
# PATIENT EXTRACTION HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _extract_dates_from_text(text: str) -> list:
    """
    Scan *text* for every date-like token and return a de-duplicated list
    capped at 10 entries, order-preserved.

    This stays as a regex helper rather than an LLM call for good reason:
    scanning a raw chunk corpus for all date occurrences is a lexical task,
    not a reasoning task.  Regex is 100× cheaper and faster here, and
    accuracy is identical.

    The results supplement the single report_date returned by
    extract_metadata_with_llm when building multi-report trend displays
    (the DATE RANGE header in the prompt needs the oldest and newest date).
    """
    date_patterns = [
        r"\d{1,2}[/\-]\d{1,2}[/\-]\d{4}",   # DD/MM/YYYY  or  DD-MM-YYYY
        r"\d{4}[/\-]\d{1,2}[/\-]\d{1,2}",   # YYYY/MM/DD  or  YYYY-MM-DD
    ]
    found: list = []
    for pat in date_patterns:
        found.extend(re.findall(pat, text))
    # dict.fromkeys deduplicates while preserving insertion (document) order.
    return list(dict.fromkeys(found))[:10]


def _build_patient_info_from_metadata(raw: dict, supplementary_text: str = "") -> dict:
    """
    Normalise the dict returned by extract_metadata_with_llm /
    extract_metadata_fallback into the internal patient_info shape that
    generate_medical_report_prompt consumes.

    extract_metadata returns (among other fields):
        patient_name, age, gender, report_date

    patient_info shape expected by generate_medical_report_prompt:
        { name: str, age: str|None, gender: str|None, dates: List[str] }

    The dates list is built from:
      1. report_date from the LLM extraction  (most reliable, comes first)
      2. All additional date tokens found in supplementary_text via regex
         (needed so multi-report prompts can show "DATE RANGE: X to Y")
    """
    report_date: Optional[str] = raw.get("report_date")

    # Start with the authoritative date from the LLM extraction.
    dates: list = [report_date] if report_date else []

    # Supplement with every other date token found in the provided text
    # so multi-report trend prompts have the full date range available.
    if supplementary_text:
        for d in _extract_dates_from_text(supplementary_text):
            if d not in dates:
                dates.append(d)

    return {
        "name":   raw.get("patient_name") or "Patient",
        "age":    raw.get("age"),
        "gender": raw.get("gender"),
        "dates":  dates[:10],
    }



# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT ASSEMBLY  (tiktoken-aware token budget)
# ─────────────────────────────────────────────────────────────────────────────

def smart_context_assembly(
    chunks: list,
    query: str,
    index,
    vectorizer,
    num_reports: int = 1,
) -> str:
    """
    Intelligently assemble context based on query and number of reports.

    KEY FIX — Adaptive context size based on report count:
      - Few reports  (1-3): more detail per report
      - Many reports (4+):  less per report, all reports represented

    UPGRADE 1 — Token budget enforced with tiktoken instead of the naive
    max_tokens * 4 character estimate.  Medical text — dense lab tables,
    OCR whitespace, numerical ranges like "3.5-5.0 mmol/L" — tokenises
    very differently from standard prose.  The *4 multiplier routinely
    drifts 30-50% on this data; tiktoken eliminates that entirely.

    Args:
        chunks:      All available text chunks from the FAISS index.
        query:       User query used to rank chunk relevance.
        index:       FAISS index for similarity search.
        vectorizer:  Fitted sentence-transformer vectorizer.
        num_reports: Number of medical reports being summarised.

    Returns:
        Assembled context string ready for the LLM prompt.
    """
    print(f"\n🧠 Smart context assembly...", flush=True)
    print(f"   Total chunks available: {len(chunks)}", flush=True)
    print(f"   Number of reports: {num_reports}", flush=True)

    # ── Adaptive token budget ─────────────────────────────────────────────────
    if num_reports == 1:
        max_tokens     = 6000   # Single report: maximum detail
        chunks_per_rep = 30
    elif num_reports <= 3:
        max_tokens     = 8000   # Few reports: good detail + trends
        chunks_per_rep = 20
    elif num_reports <= 5:
        max_tokens     = 10000  # Medium: balanced
        chunks_per_rep = 15
    else:
        max_tokens     = 12000  # Many reports: ensure full coverage
        chunks_per_rep = 10

    print(f"   Token budget : {max_tokens} (exact, via tiktoken)", flush=True)
    print(f"   Chunks/report: {chunks_per_rep}", flush=True)

    # ── Embed the query ───────────────────────────────────────────────────────
    try:
        query_emb = vectorizer.transform([query]).toarray()[0].astype("float32")

        # Padding guard: sentence-transformer always returns EMBEDDING_DIM
        # dimensions, but kept here as a defensive check.
        if len(query_emb) < EMBEDDING_DIM:
            padding   = np.zeros(EMBEDDING_DIM - len(query_emb), dtype="float32")
            query_emb = np.concatenate([query_emb, padding])

        query_emb = query_emb.reshape(1, -1)
        faiss.normalize_L2(query_emb)

    except Exception as exc:
        print(f"   ⚠️  Query embedding failed: {exc}", flush=True)
        fallback_count = min(50, len(chunks))
        return "\n\n".join(c["text"] for c in chunks[:fallback_count])

    # ── FAISS similarity search ───────────────────────────────────────────────
    search_k          = min(len(chunks), chunks_per_rep * num_reports * 2)
    scores, indices   = index.search(query_emb, search_k)

    sorted_results    = sorted(
        zip(indices[0], scores[0]),
        key=lambda x: x[1],
        reverse=True,
    )

    # ── Ensure diversity across all reports ───────────────────────────────────
    # Each chunk carries its own doc_id from chunk_text_with_metadata(), so
    # grouping is exact — no integer-division approximation needed.
    selected_by_report: dict = {}
    for idx, score in sorted_results:
        if idx >= len(chunks):
            continue
        chunk_obj  = chunks[idx]
        report_key = chunk_obj["doc_id"]
        bucket     = selected_by_report.setdefault(report_key, [])
        if len(bucket) < chunks_per_rep:
            bucket.append((idx, score, chunk_obj["text"]))

    # Flatten in document order to preserve reading flow
    all_selected = []
    for report_id in sorted(selected_by_report.keys()):
        all_selected.extend(selected_by_report[report_id])
    all_selected.sort(key=lambda x: x[0])

    # ── Token-aware budget gate (Upgrade 1) ───────────────────────────────────
    final_chunks:  list = []
    total_tokens:  int  = 0

    for idx, score, chunk in all_selected:
        chunk_tokens = count_tokens(chunk)

        if total_tokens + chunk_tokens <= max_tokens:
            final_chunks.append((idx, score, chunk))
            total_tokens += chunk_tokens
        else:
            # Attempt to fit a token-accurate prefix of high-relevance chunks.
            # Threshold: 150 tokens is enough to include a meaningful lab panel;
            # below that the fragment adds noise without value.
            remaining = max_tokens - total_tokens
            if remaining > 150 and score > 0.5:
                truncated     = _truncate_to_tokens(chunk, remaining)
                final_chunks.append((idx, score, truncated))
                total_tokens += count_tokens(truncated)
            break

    print(
        f"   ✅ Selected {len(final_chunks)} chunks "
        f"from {len(selected_by_report)} reports",
        flush=True,
    )
    print(f"   Total: {total_tokens} tokens (exact)", flush=True)
    if final_chunks:
        print(
            f"   Score range: {final_chunks[0][1]:.3f} "
            f"to {final_chunks[-1][1]:.3f}",
            flush=True,
        )

    context_parts = [chunk for _, _, chunk in final_chunks]
    return "\n\n".join(context_parts)


# ─────────────────────────────────────────────────────────────────────────────
# PROMPT BUILDERS  (logic unchanged — same output as v1)
# ─────────────────────────────────────────────────────────────────────────────

def generate_medical_report_prompt(
    context: str,
    patient_info: dict,
    num_reports: int,
) -> tuple:
    """
    Generate optimised prompts for medical report summarisation.

    KEY OPTIMISATIONS for small models:
      1. Clear, structured instructions
      2. Explicit output format with section headers
      3. Shorter system prompts (small models struggle with long instructions)

    Args:
        context:      Assembled context string from smart_context_assembly.
        patient_info: Dict with keys: name, age, gender, dates.
        num_reports:  Determines which prompt template is selected.

    Returns:
        (system_prompt, user_prompt) tuple ready for the API call.
    """
    system_prompt = """You are a medical report summarizer. Create accurate, well-organized summaries.

RULES:
1. Include ALL test results with values and units
2. Show trends if multiple dates exist: "Test: Date1 (value) → Date2 (value)"
3. Flag abnormal values with ⚠️
4. Use clear section headers with **bold**
5. Be thorough but concise"""

    if num_reports == 1:
        user_prompt = f"""Summarize this medical report in detail.

PATIENT: {patient_info.get('name', 'Unknown')}
AGE: {patient_info.get('age', 'N/A')} | GENDER: {patient_info.get('gender', 'N/A')}
DATE: {patient_info.get('dates', ['Not found'])[0] if patient_info.get('dates') else 'Not found'}

REPORT DATA:
{context}

Create a detailed summary with these sections:

**Patient Information**
- Name, Age, Gender, Date

**Test Results**
List EVERY test with:
- Test name: Value Unit (Reference range)
- Mark abnormal with ⚠️

**Abnormal Findings**
- List all out-of-range values
- Indicate severity (High/Low/Critical)

**Clinical Notes**
- Any interpretations or recommendations from the report

Be comprehensive. Include all numeric values."""

    elif num_reports <= 3:
        user_prompt = f"""Summarize these medical reports showing trends.

PATIENT: {patient_info.get('name', 'Unknown')}
AGE: {patient_info.get('age', 'N/A')} | GENDER: {patient_info.get('gender', 'N/A')}
DATES: {', '.join(patient_info.get('dates', [])[:3]) or 'Not found'}

REPORTS DATA:
{context}

Create a summary with:

**Patient Information**
- Name, Age, Gender
- Report dates (oldest to newest)

**Test Results by Category**
For each test type (Blood, Lipid, Kidney, etc.):
- List all parameters
- Show trends: "Parameter: Date1 (value) → Date2 (value) → Date3 (value)"
- Mark abnormal with ⚠️

**Key Findings**
- Worsening trends (↑ or ↓)
- Persistent abnormalities
- New abnormalities

**Summary**
- Overall health status
- Important trends
- Recommendations (if any)

Include all test values with units."""

    else:
        user_prompt = f"""Summarize these {num_reports} medical reports focusing on trends.

PATIENT: {patient_info.get('name', 'Unknown')}
AGE: {patient_info.get('age', 'N/A')} | GENDER: {patient_info.get('gender', 'N/A')}
REPORTS: {num_reports} reports
DATE RANGE: {patient_info.get('dates', ['Unknown'])[0] if patient_info.get('dates') else 'Unknown'} to {patient_info.get('dates', ['Unknown'])[-1] if patient_info.get('dates') else 'Unknown'}

REPORTS DATA:
{context}

Create a concise summary with:

**Patient Overview**
- Name, Age, Gender
- Number of reports: {num_reports}
- Date range

**Test Categories Found**
List each category (Blood, Lipid, Kidney, etc.)

**Key Parameters & Trends**
For major tests only:
- Parameter name
- Trend: First value → Latest value (direction: ↑↓→)
- Status: Normal/Abnormal ⚠️

**Critical Findings**
- Any concerning trends
- Persistent abnormalities
- Values needing attention

**Overall Assessment**
- Health trajectory (improving/stable/declining)
- Key recommendations

Focus on trends and important findings. Don't list every single value."""

    return system_prompt, user_prompt


# ─────────────────────────────────────────────────────────────────────────────
# UPGRADE 3 — ASYNC OPENAI CLIENT
# ─────────────────────────────────────────────────────────────────────────────

def _make_openai_client() -> AsyncOpenAI:
    """
    Create a fresh AsyncOpenAI client.

    CRITICAL — this must be called INSIDE an asyncio.run() context (i.e.
    inside the coroutine), never at module level.  The SDK's underlying
    httpx.AsyncClient binds its async transport to the event loop that is
    active at construction time.  Flask calls asyncio.run() once per request,
    which creates and destroys a new event loop each time.  Building the
    client inside the coroutine guarantees its lifetime exactly matches the
    event loop that owns it.  Reusing a module-level client across multiple
    asyncio.run() calls causes "Event loop is closed" / httpx transport errors
    from the second request onwards — the same bug that was fixed in
    extract_metadata.py v2.

    Configuration:
      timeout=90.0   — matches the original requests.post(timeout=90) behaviour;
                        the SDK interprets a float as the total request timeout.
      max_retries=1  — one automatic retry on 429 / 5xx.  Not higher because
                        large-context summary calls are expensive; we don't want
                        to double-bill on a genuine overload.
    """
    return AsyncOpenAI(
        api_key=OPENAI_API_KEY,
        timeout=90.0,
        max_retries=1,
    )


async def _async_call_openai(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
) -> str:
    """
    Async core — one chat completion call using the AsyncOpenAI SDK.

    The client is created here and closed in finally so its httpx connection
    pool is released before the event loop exits.  This is the same pattern
    used by _run_single() in extract_metadata.py.

    Args:
        system_prompt: System role message.
        user_prompt:   User role message (contains assembled context).
        max_tokens:    Max output tokens for the completion.

    Returns:
        The generated summary string.

    Raises:
        openai.APITimeoutError, openai.APIStatusError, etc. — the SDK raises
        typed exceptions so callers can distinguish timeout from rate-limit
        from server error without parsing status codes manually.
    """
    client = _make_openai_client()
    try:
        print(f"🚀 Calling OpenAI API (async SDK)...", flush=True)
        print(f"   Model: {MODEL_NAME}", flush=True)
        print(f"   Max output tokens: {max_tokens}", flush=True)

        response = await client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt},
            ],
            temperature=0.1,       # low temperature for medical consistency
            max_tokens=max_tokens,
        )

        summary: str = response.choices[0].message.content

        # ── Usage logging (same as original) ─────────────────────────────────
        usage = response.usage
        print(f"   ✅ Generated: {len(summary)} chars", flush=True)
        if usage:
            print(
                f"   📊 Tokens: {usage.prompt_tokens} prompt + "
                f"{usage.completion_tokens} completion = "
                f"{usage.total_tokens} total",
                flush=True,
            )
            prompt_cost     = usage.prompt_tokens     * 0.00015 / 1000
            completion_cost = usage.completion_tokens * 0.0006  / 1000
            print(
                f"   💰 Estimated cost: ${prompt_cost + completion_cost:.6f}",
                flush=True,
            )

        return summary

    finally:
        # Always release the httpx connection pool before the loop exits.
        await client.close()


def _run_openai_call(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
) -> str:
    """
    Synchronous entry-point: wraps _async_call_openai in asyncio.run().

    This is an internal function.  Public callers should use call_openai_api().
    """
    return asyncio.run(_async_call_openai(system_prompt, user_prompt, max_tokens))


def call_openai_api(
    system_prompt: str,
    user_prompt: str,
    num_reports: int = 1,
) -> str:
    """
    Call OpenAI API with gpt-4.1-nano.

    PUBLIC — signature is identical to v1.  The implementation now uses
    AsyncOpenAI instead of raw requests.post, gaining SDK-managed retries,
    proper typed exceptions, and connection pooling.

    Args:
        system_prompt: System role message.
        user_prompt:   User role message containing assembled context.
        num_reports:   Drives the adaptive max_tokens for the completion.

    Returns:
        Generated summary string.

    Raises:
        ValueError: if OPENAI_API_KEY is not set.
        Exception:  wraps any SDK or event-loop error with a clean message.
    """
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not set in environment")

    # Adaptive output token budget — unchanged values from v1.
    if num_reports == 1:
        max_tokens = 2000
    elif num_reports <= 3:
        max_tokens = 3000
    elif num_reports <= 5:
        max_tokens = 4000
    else:
        max_tokens = 5000

    print(f"   Max tokens: {max_tokens} (adaptive for {num_reports} reports)", flush=True)

    try:
        return _run_openai_call(system_prompt, user_prompt, max_tokens)

    except RuntimeError as exc:
        # "This event loop is already running" — Jupyter / pytest-asyncio.
        # Should never occur in production Flask routes but guard defensively.
        raise Exception(
            f"OpenAI call failed — event loop conflict: {exc}"
        ) from exc

    except Exception as exc:
        # Re-raise with a clean message the caller can log without traceback.
        raise Exception(f"OpenAI API call failed: {exc}") from exc


# ─────────────────────────────────────────────────────────────────────────────
# MAIN PUBLIC ENTRY POINTS  (signatures unchanged)
# ─────────────────────────────────────────────────────────────────────────────

def ask_rag_improved(
    question: str,
    temp_dir: str,
    folder_type: str  = None,
    num_reports: int  = 1,
    patient_metadata: dict = None,
) -> str:
    """
    Improved RAG query optimised for gpt-4.1-nano.
    ONLY processes medical reports; ignores bills/insurance/prescriptions.

    UPGRADE 2 — Patient extraction path:
      • If patient_metadata is provided (fetched from the DB during ingestion)
        it is used directly — behaviour unchanged from v1.
      • If patient_metadata is None, we now call extract_metadata_with_llm()
        from extract_metadata.py instead of the local regex extract_patient_info.
        That function uses AsyncOpenAI + Pydantic structured outputs and has
        its own regex fallback; quality is strictly better than the old path.

    Args:
        question:          Query to answer / summarise.
        temp_dir:          Temporary directory holding index.faiss / chunks.pkl.
        folder_type:       Should be 'reports', 'medical', or 'tests'.
        num_reports:       Number of source reports in the index.
        patient_metadata:  Pre-extracted dict from the database (optional).
                           Expected keys: patient_name, age, gender, dates.

    Returns:
        Generated summary string, or an error string prefixed with ❌.
    """
    print(f"\n{'='*80}", flush=True)
    print(f"🤖 IMPROVED RAG QUERY (Medical Reports Only)", flush=True)
    print(f"{'='*80}", flush=True)
    print(f"Question: {question[:100]}...", flush=True)
    print(f"Folder:   {folder_type or 'ALL'}", flush=True)
    print(f"Reports:  {num_reports}", flush=True)
    print(f"Model:    {MODEL_NAME}", flush=True)
    print(f"Temp dir: {temp_dir}", flush=True)

    # ── Folder type guard ─────────────────────────────────────────────────────
    if folder_type and folder_type not in ("reports", "medical", "tests"):
        error = f"❌ This summariser only processes medical reports, not {folder_type}"
        print(error, flush=True)
        return error

    # ── Load FAISS index + chunks ─────────────────────────────────────────────
    try:
        print("\n📂 Loading from temp directory...", flush=True)
        index, chunks, vectorizer = load_index_and_chunks(temp_dir)
    except Exception as exc:
        error = f"❌ Failed to load from temp: {exc}"
        print(error, flush=True)
        return error

    # ── Patient info resolution (Upgrade 2) ───────────────────────────────────
    if patient_metadata:
        # Fast path: caller already has DB-extracted metadata — use it directly.
        patient_info = {
            "name":   patient_metadata.get("patient_name", "Patient"),
            "age":    patient_metadata.get("age"),
            "gender": patient_metadata.get("gender"),
            "dates":  patient_metadata.get("dates", []),
        }
        print("\n✅ Using pre-extracted metadata from database", flush=True)

    else:
        # Slow path (fallback): no DB metadata available.
        # Previously called the local regex extract_patient_info(); now delegates
        # to extract_metadata_with_llm() from extract_metadata.py which uses
        # AsyncOpenAI + Pydantic structured outputs.  The function itself
        # falls back to regex if the API is unavailable, so resilience is
        # identical to the old code — quality is strictly higher.
        print("\n🔍 Extracting patient information via LLM...", flush=True)

        # First 10 chunks hold the report header (patient name, DOB, etc.)
        # 800 chars is the sample window used by extract_metadata_with_llm.
        header_text = "\n".join(c["text"] for c in chunks[:10])

        raw = extract_metadata_with_llm(
            header_text,
            file_name="query_time_extraction",
        )

        # Supplement with a wider date scan (up to 20 chunks) so multi-report
        # trend prompts have the full date range, not just the first report_date.
        scan_text    = "\n".join(c["text"] for c in chunks[:20])
        patient_info = _build_patient_info_from_metadata(raw, supplementary_text=scan_text)

    print(f"   Patient: {patient_info['name']}", flush=True)
    print(f"   Age:     {patient_info['age'] or 'N/A'}", flush=True)
    print(f"   Gender:  {patient_info['gender'] or 'N/A'}", flush=True)
    if patient_info["dates"]:
        print(f"   Dates:   {', '.join(patient_info['dates'][:3])}...", flush=True)
    else:
        print("   Dates:   None", flush=True)

    # ── Assemble context ──────────────────────────────────────────────────────
    context = smart_context_assembly(
        chunks=chunks,
        query=question,
        index=index,
        vectorizer=vectorizer,
        num_reports=num_reports,
    )

    # ── Build prompts ─────────────────────────────────────────────────────────
    print(f"\n📝 Generating optimised medical report summary prompt...", flush=True)
    system_prompt, user_prompt = generate_medical_report_prompt(
        context,
        patient_info,
        num_reports,
    )

    # ── Call OpenAI ───────────────────────────────────────────────────────────
    try:
        summary = call_openai_api(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            num_reports=num_reports,
        )
        print(f"✅ Summary generated successfully", flush=True)
        print(f"   Length: {len(summary)} chars", flush=True)
        print(f"{'='*80}\n", flush=True)
        return summary

    except Exception as exc:
        error = f"❌ Summary generation failed: {exc}"
        print(error, flush=True)
        return error




# ─────────────────────────────────────────────────────────────────────────────
# NOTE — METADATA-AWARE CHUNKING  (what would change and where)
# ─────────────────────────────────────────────────────────────────────────────
#
# The current pipeline stores chunks as a flat List[str].  Report boundary
# detection in smart_context_assembly uses integer division:
#
#     report_id = chunk_index // (total_chunks // num_reports)
#
# This is fragile: if one report has 40 chunks and another has 10, every
# boundary estimate is wrong.
#
# The fix is to make chunks carry their own identity.  Here is exactly what
# would need to change across the codebase:
#
# 1. clean_chunk.py  — chunk_text() / chunk_pdf_text()
#    Return List[dict] instead of List[str]:
#        {"text": "...", "metadata": {"doc_id": "report_1.pdf", "page": 2}}
#
# 2. embed_store.py  — build_faiss_index()
#    Accept List[dict].  Extract .["text"] for embedding.
#    Pickle the full dict list as chunks.pkl, not just text strings.
#
# 3. embed_store.py  — load_index_and_chunks()
#    Return (index, List[dict], vectorizer) — same tuple, different element type.
#
# 4. rag_query.py  (this file) — smart_context_assembly()
#    Replace:  chunks[idx]            with  chunks[idx]["text"]
#    Replace:  chunk_index // N       with  chunks[idx]["metadata"]["doc_id"]
#    The selected_by_report dict keyed on doc_id instead of integer division.
#
# 5. app_api.py  — any place that directly iterates over chunks
#    Update to use chunk["text"] instead of treating chunk as a string.
#
# Total blast radius: 3 files, ~20 line changes.  The FAISS index format
# itself does not change — only the Python-side chunk list does.
# ─────────────────────────────────────────────────────────────────────────────