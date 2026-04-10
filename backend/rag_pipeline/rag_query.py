"""
RAG query pipeline module for assembling contexts and querying OpenAI.
"""

import asyncio
import os
import re
from typing import Optional

import faiss
import numpy as np
import tiktoken
from openai import AsyncOpenAI

from rag_pipeline.embed_store import load_index_and_chunks, EMBEDDING_DIM
from rag_pipeline.extract_metadata import (
    extract_metadata_with_llm,
    extract_metadata_fallback,
)

OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
MODEL_NAME: str = "gpt-4.1-nano"
OPENAI_CHAT_URL: str = "https://api.openai.com/v1/chat/completions"

def _build_tokenizer() -> tiktoken.Encoding:
    """Return a tiktoken encoder for MODEL_NAME, falling back to cl100k_base."""
    try:
        enc = tiktoken.encoding_for_model(MODEL_NAME)
        print(f"✅ tiktoken: loaded encoding for '{MODEL_NAME}'", flush=True)
        return enc
    except KeyError:
        print(
            f"⚠️  tiktoken: '{MODEL_NAME}' not in registry "
            f"— using cl100k_base (GPT-4 family encoding)",
            flush=True,
        )
        return tiktoken.get_encoding("cl100k_base")

_TOKENIZER: tiktoken.Encoding = _build_tokenizer()

def count_tokens(text: str) -> int:
    """Return exact token count for text."""
    return len(_TOKENIZER.encode(text))

def _truncate_to_tokens(text: str, max_tok: int) -> str:
    """Truncate text safely by encoding/decoding to avoid mid-sequence splits."""
    ids = _TOKENIZER.encode(text)
    if len(ids) <= max_tok:
        return text
    return _TOKENIZER.decode(ids[:max_tok])

def _extract_dates_from_text(text: str) -> list:
    """Extract and deduplicate up to 10 dates from text."""
    date_patterns = [
        r"\d{1,2}[/\-]\d{1,2}[/\-]\d{4}",
        r"\d{4}[/\-]\d{1,2}[/\-]\d{1,2}",
    ]
    found: list = []
    for pat in date_patterns:
        found.extend(re.findall(pat, text))
    return list(dict.fromkeys(found))[:10]

def _build_patient_info_from_metadata(raw: dict, supplementary_text: str = "") -> dict:
    """Normalize extracted metadata into the internal patient_info format."""
    report_date: Optional[str] = raw.get("report_date")
    dates: list = [report_date] if report_date else []

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

def smart_context_assembly(
    chunks: list,
    query: str,
    index,
    vectorizer,
    num_reports: int = 1,
) -> str:
    """Assemble relevant context adhering to token budgets."""
    print(f"\n🧠 Smart context assembly...", flush=True)
    print(f"   Total chunks available: {len(chunks)}", flush=True)
    print(f"   Number of reports: {num_reports}", flush=True)

    # Adaptive token budget based on report count
    if num_reports == 1:
        max_tokens     = 6000
        chunks_per_rep = 30
    elif num_reports <= 3:
        max_tokens     = 8000
        chunks_per_rep = 20
    elif num_reports <= 5:
        max_tokens     = 10000
        chunks_per_rep = 15
    else:
        max_tokens     = 12000
        chunks_per_rep = 10

    print(f"   Token budget : {max_tokens} (exact, via tiktoken)", flush=True)
    print(f"   Chunks/report: {chunks_per_rep}", flush=True)

    try:
        query_emb = vectorizer.transform([query]).toarray()[0].astype("float32")

        # Pad embedding if necessary
        if len(query_emb) < EMBEDDING_DIM:
            padding   = np.zeros(EMBEDDING_DIM - len(query_emb), dtype="float32")
            query_emb = np.concatenate([query_emb, padding])

        query_emb = query_emb.reshape(1, -1)
        faiss.normalize_L2(query_emb)

    except Exception as exc:
        print(f"   ⚠️  Query embedding failed: {exc}", flush=True)
        fallback_count = min(50, len(chunks))
        return "\n\n".join(c["text"] for c in chunks[:fallback_count])

    search_k          = min(len(chunks), chunks_per_rep * num_reports * 2)
    scores, indices   = index.search(query_emb, search_k)

    sorted_results    = sorted(
        zip(indices[0], scores[0]),
        key=lambda x: x[1],
        reverse=True,
    )

    selected_by_report: dict = {}
    for idx, score in sorted_results:
        if idx >= len(chunks):
            continue
        chunk_obj  = chunks[idx]
        report_key = chunk_obj["doc_id"]
        bucket     = selected_by_report.setdefault(report_key, [])
        if len(bucket) < chunks_per_rep:
            bucket.append((idx, score, chunk_obj["text"]))

    all_selected = []
    for report_id in sorted(selected_by_report.keys()):
        all_selected.extend(selected_by_report[report_id])
    all_selected.sort(key=lambda x: x[0])

    final_chunks:  list = []
    total_tokens:  int  = 0

    for idx, score, chunk in all_selected:
        chunk_tokens = count_tokens(chunk)

        if total_tokens + chunk_tokens <= max_tokens:
            final_chunks.append((idx, score, chunk))
            total_tokens += chunk_tokens
        else:
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

def generate_medical_report_prompt(
    context: str,
    patient_info: dict,
    num_reports: int,
) -> tuple:
    """Generate optimized medical report summarization prompts."""
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

def _make_openai_client() -> AsyncOpenAI:
    """Create a fresh AsyncOpenAI client bound to the current event loop."""
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
    """Execute a chat completion call using AsyncOpenAI."""
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
            temperature=0.1,
            max_tokens=max_tokens,
        )

        summary: str = response.choices[0].message.content

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
        await client.close()

def _run_openai_call(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
) -> str:
    """Synchronous wrapper for _async_call_openai."""
    return asyncio.run(_async_call_openai(system_prompt, user_prompt, max_tokens))

def call_openai_api(
    system_prompt: str,
    user_prompt: str,
    num_reports: int = 1,
) -> str:
    """Call OpenAI API using the adaptive token budget."""
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not set in environment")

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
        raise Exception(f"OpenAI call failed — event loop conflict: {exc}") from exc
    except Exception as exc:
        raise Exception(f"OpenAI API call failed: {exc}") from exc

def ask_rag_improved(
    question: str,
    temp_dir: str,
    folder_type: str  = None,
    num_reports: int  = 1,
    patient_metadata: dict = None,
) -> str:
    """Execute RAG query for medical reports."""
    print(f"\n{'='*80}", flush=True)
    print(f"🤖 IMPROVED RAG QUERY (Medical Reports Only)", flush=True)
    print(f"{'='*80}", flush=True)
    print(f"Question: {question[:100]}...", flush=True)
    print(f"Folder:   {folder_type or 'ALL'}", flush=True)
    print(f"Reports:  {num_reports}", flush=True)
    print(f"Model:    {MODEL_NAME}", flush=True)
    print(f"Temp dir: {temp_dir}", flush=True)

    if folder_type and folder_type not in ("reports", "medical", "tests"):
        error = f"❌ This summariser only processes medical reports, not {folder_type}"
        print(error, flush=True)
        return error

    try:
        print("\n📂 Loading from temp directory...", flush=True)
        index, chunks, vectorizer = load_index_and_chunks(temp_dir)
    except Exception as exc:
        error = f"❌ Failed to load from temp: {exc}"
        print(error, flush=True)
        return error

    if patient_metadata:
        patient_info = {
            "name":   patient_metadata.get("patient_name", "Patient"),
            "age":    patient_metadata.get("age"),
            "gender": patient_metadata.get("gender"),
            "dates":  patient_metadata.get("dates", []),
        }
        print("\n✅ Using pre-extracted metadata from database", flush=True)
    else:
        print("\n🔍 Extracting patient information via LLM...", flush=True)

        header_text = "\n".join(c["text"] for c in chunks[:10])
        raw = extract_metadata_with_llm(
            header_text,
            file_name="query_time_extraction",
        )

        scan_text    = "\n".join(c["text"] for c in chunks[:20])
        patient_info = _build_patient_info_from_metadata(raw, supplementary_text=scan_text)

    print(f"   Patient: {patient_info['name']}", flush=True)
    print(f"   Age:     {patient_info['age'] or 'N/A'}", flush=True)
    print(f"   Gender:  {patient_info['gender'] or 'N/A'}", flush=True)
    if patient_info["dates"]:
        print(f"   Dates:   {', '.join(patient_info['dates'][:3])}...", flush=True)
    else:
        print("   Dates:   None", flush=True)

    context = smart_context_assembly(
        chunks=chunks,
        query=question,
        index=index,
        vectorizer=vectorizer,
        num_reports=num_reports,
    )

    print(f"\n📝 Generating optimised medical report summary prompt...", flush=True)
    system_prompt, user_prompt = generate_medical_report_prompt(
        context,
        patient_info,
        num_reports,
    )

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