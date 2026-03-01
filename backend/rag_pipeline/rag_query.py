# backend/rag_pipeline/rag_query.py

import os
import numpy as np
import faiss
import requests
import pickle
import re
from rag_pipeline.embed_store import load_index_and_chunks, EMBEDDING_DIM


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"

# Using GPT-4.1-nano
MODEL_NAME = "gpt-4.1-nano"


def extract_patient_info(text: str) -> dict:
    """Extract comprehensive patient information"""
    info = {
        'name': 'Patient',
        'age': None,
        'gender': None,
        'dates': []
    }
    
    # Name patterns
    name_patterns = [
        r"Patient\s*Name\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
        r"Name\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
    ]
    
    for pattern in name_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            if len(name) > 2 and name.lower() not in ['sex', 'age', 'male', 'female']:
                info['name'] = name
                break
    
    # Age
    age_match = re.search(r"Age\s*[:\-]?\s*(\d+)", text, re.IGNORECASE)
    if age_match:
        info['age'] = age_match.group(1)
    
    # Gender
    if re.search(r'\b(Male|M)\b', text, re.IGNORECASE):
        info['gender'] = 'Male'
    elif re.search(r'\b(Female|F)\b', text, re.IGNORECASE):
        info['gender'] = 'Female'
    
    # Dates
    date_patterns = [
        r"(\d{1,2}[/-]\d{1,2}[/-]\d{4})",
        r"(\d{4}[/-]\d{1,2}[/-]\d{1,2})",
    ]
    
    for pattern in date_patterns:
        matches = re.findall(pattern, text)
        info['dates'].extend(matches)
    
    # Unique dates
    info['dates'] = list(set(info['dates']))[:10]
    
    return info


def smart_context_assembly(chunks: list, query: str, index, vectorizer, 
                           num_reports: int = 1) -> str:
    """
    Intelligently assemble context based on query and number of reports
    
    KEY FIX: Adaptive context size based on report count
    - Few reports (1-3): Use more detail per report
    - Many reports (4+): Use less per report but ensure all are represented
    
    Args:
        chunks: All available chunks
        query: User query
        index: FAISS index
        vectorizer: Fitted vectorizer
        num_reports: Number of reports being summarized
    
    Returns:
        Assembled context string
    """
    print(f"\n🧠 Smart context assembly...")
    print(f"   Total chunks available: {len(chunks)}")
    print(f"   Number of reports: {num_reports}")
    
    # ADAPTIVE TOKEN BUDGET based on report count
    # llama-3.1-8b-instant has 128k context but we want to leave room for output
    if num_reports == 1:
        max_tokens = 6000  # Single report: Very detailed
        chunks_per_report = 30
    elif num_reports <= 3:
        max_tokens = 8000  # Few reports: Good detail
        chunks_per_report = 20
    elif num_reports <= 5:
        max_tokens = 10000  # Medium: Balanced
        chunks_per_report = 15
    else:
        max_tokens = 12000  # Many reports: Ensure coverage
        chunks_per_report = 10
    
    print(f"   Token budget: {max_tokens} (adaptive)")
    print(f"   Target chunks per report: {chunks_per_report}")
    
    # Embed query
    try:
        query_emb = vectorizer.transform([query]).toarray()[0].astype('float32')
        
        if len(query_emb) < EMBEDDING_DIM:
            padding = np.zeros(EMBEDDING_DIM - len(query_emb), dtype='float32')
            query_emb = np.concatenate([query_emb, padding])
        
        query_emb = query_emb.reshape(1, -1)
        faiss.normalize_L2(query_emb)
        
    except Exception as e:
        print(f"   ⚠️  Query embedding failed: {e}")
        # Fallback: use first N chunks
        fallback_count = min(50, len(chunks))
        return "\n\n".join(chunks[:fallback_count])
    
    # Search with adaptive k based on report count
    search_k = min(len(chunks), chunks_per_report * num_reports * 2)
    scores, indices = index.search(query_emb, search_k)
    
    # Sort by score (descending)
    sorted_results = sorted(
        zip(indices[0], scores[0]), 
        key=lambda x: x[1], 
        reverse=True
    )
    
    # IMPROVED: Ensure diversity across reports
    # Group chunks by approximate report (chunks are sequential per report)
    chunks_per_actual_report = len(chunks) // num_reports if num_reports > 0 else len(chunks)
    
    selected_by_report = {}
    for idx, score in sorted_results:
        if idx < len(chunks):
            # Determine which report this chunk belongs to
            report_id = idx // chunks_per_actual_report
            
            if report_id not in selected_by_report:
                selected_by_report[report_id] = []
            
            # Add chunk if we haven't hit the per-report limit
            if len(selected_by_report[report_id]) < chunks_per_report:
                selected_by_report[report_id].append((idx, score, chunks[idx]))
    
    # Flatten and sort by original order
    all_selected = []
    for report_id in sorted(selected_by_report.keys()):
        all_selected.extend(selected_by_report[report_id])
    
    all_selected.sort(key=lambda x: x[0])  # Sort by chunk index to maintain flow
    
    # Apply token budget
    final_chunks = []
    total_chars = 0
    max_chars = max_tokens * 4  # Rough estimate: 1 token ≈ 4 chars
    
    for idx, score, chunk in all_selected:
        chunk_chars = len(chunk)
        
        if total_chars + chunk_chars <= max_chars:
            final_chunks.append((idx, score, chunk))
            total_chars += chunk_chars
        else:
            # Try to fit a truncated version of important chunks
            remaining = max_chars - total_chars
            if remaining > 500 and score > 0.5:  # High relevance chunk
                truncated = chunk[:remaining]
                final_chunks.append((idx, score, truncated))
                total_chars += remaining
            break
    
    print(f"   ✅ Selected {len(final_chunks)} chunks from {len(selected_by_report)} reports")
    print(f"   Total: {total_chars} chars (~{total_chars//4} tokens)")
    if final_chunks:
        print(f"   Score range: {final_chunks[0][1]:.3f} to {final_chunks[-1][1]:.3f}")
    
    # Assemble context WITHOUT chunk markers (cleaner for small model)
    context_parts = [chunk for idx, score, chunk in final_chunks]
    
    return "\n\n".join(context_parts)


def generate_medical_report_prompt(context: str, patient_info: dict, num_reports: int) -> tuple:
    """
    Generate optimized prompts for medical reports using llama-3.1-8b-instant
    
    KEY OPTIMIZATIONS for small models:
    1. Clear, structured instructions
    2. Explicit output format
    3. Shorter system prompts (small models struggle with long instructions)
    4. Examples in the format we want
    """
    
    # OPTIMIZED: Shorter, clearer system prompt
    system_prompt = """You are a medical report summarizer. Create accurate, well-organized summaries.

RULES:
1. Include ALL test results with values and units
2. Show trends if multiple dates exist: "Test: Date1 (value) → Date2 (value)"
3. Flag abnormal values with ⚠️
4. Use clear section headers with **bold**
5. Be thorough but concise"""

    # ADAPTIVE: Different prompts based on report count
    if num_reports == 1:
        # Single report: Maximum detail
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
        # Few reports: Good detail + trends
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
        # Many reports: Focus on trends and key findings
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


def call_openai_api(system_prompt: str, user_prompt: str, num_reports: int = 1) -> str:
    """
    Call OpenAI API with gpt-4.1-nano
    
    KEY OPTIMIZATIONS:
    1. Adaptive max_tokens based on report count
    2. Lower temperature for consistency
    3. gpt-4.1-nano: Fast, cheap, and high quality
    """
    
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY not set in environment")
    
    # ADAPTIVE: More output tokens for more reports
    # gpt-4.1-nano supports up to 16k output tokens
    if num_reports == 1:
        max_tokens = 2000  # Single report: Very detailed
    elif num_reports <= 3:
        max_tokens = 3000  # Few reports: Good detail + trends
    elif num_reports <= 5:
        max_tokens = 4000  # Medium: Comprehensive
    else:
        max_tokens = 5000  # Many reports: Full trends analysis
    
    print(f"🚀 Calling OpenAI API...")
    print(f"   Model: {MODEL_NAME}")
    print(f"   Max tokens: {max_tokens} (adaptive for {num_reports} reports)")
    
    payload = {
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "model": MODEL_NAME,
        "temperature": 0.1,  # Low temperature for consistency
        "max_tokens": max_tokens,
    }
    
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(
            OPENAI_CHAT_URL,
            json=payload,
            headers=headers,
            timeout=90  # OpenAI can be a bit slower
        )
        response.raise_for_status()
        
        result = response.json()
        summary = result["choices"][0]["message"]["content"]
        
        # Get token usage
        usage = result.get("usage", {})
        print(f"   ✅ Generated: {len(summary)} chars")
        if usage:
            print(f"   📊 Tokens: {usage.get('prompt_tokens', 0)} prompt + " +
                  f"{usage.get('completion_tokens', 0)} completion = " +
                  f"{usage.get('total_tokens', 0)} total")
            
            # Show cost estimate (gpt-4.1-nano pricing)
            prompt_cost = usage.get('prompt_tokens', 0) * 0.00015 / 1000  # Estimated pricing
            completion_cost = usage.get('completion_tokens', 0) * 0.0006 / 1000
            total_cost = prompt_cost + completion_cost
            print(f"   💰 Estimated cost: ${total_cost:.6f}")
        
        return summary
        
    except requests.exceptions.Timeout:
        raise Exception("OpenAI API timeout - request took too long")
    except requests.exceptions.HTTPError as e:
        error_text = e.response.text
        raise Exception(f"OpenAI API error: {e.response.status_code} - {error_text}")
    except requests.exceptions.RequestException as e:
        raise Exception(f"OpenAI API request failed: {str(e)}")
    except KeyError as e:
        raise Exception(f"Unexpected API response format: {str(e)}")


def ask_rag_improved(question: str, temp_dir: str, folder_type: str = None,
                    num_reports: int = 1, patient_metadata: dict = None) -> str:
    """
    Improved RAG query optimized for gpt-4.1-nano
    ONLY processes medical reports, ignores bills/insurance/prescriptions
    
    Args:
        question: Query to answer
        temp_dir: Temporary directory with index/vectorizer
        folder_type: Type of folder (should be 'reports' for medical reports)
        num_reports: Number of reports
        patient_metadata: Pre-extracted patient metadata from database (optional)
    
    Returns:
        Generated summary text
    """
    print(f"\n{'='*80}")
    print(f"🤖 IMPROVED RAG QUERY (Medical Reports Only)")
    print(f"{'='*80}")
    print(f"Question: {question[:100]}...")
    print(f"Folder: {folder_type or 'ALL'}")
    print(f"Reports: {num_reports}")
    print(f"Model: {MODEL_NAME}")
    print(f"Temp dir: {temp_dir}")
    
    # VALIDATION: Only process medical reports
    if folder_type and folder_type not in ['reports', 'medical', 'tests']:
        error = f"❌ This summarizer only processes medical reports, not {folder_type}"
        print(error)
        return error
    
    try:
        # Load index, chunks, and vectorizer from temp
        print("\n📂 Loading from temp directory...")
        index, chunks, vectorizer = load_index_and_chunks(temp_dir)
        
    except Exception as e:
        error = f"❌ Failed to load from temp: {str(e)}"
        print(error)
        return error
    
    # Use pre-extracted patient info if provided, otherwise extract from text
    if patient_metadata:
        patient_info = {
            'name': patient_metadata.get('patient_name', 'Patient'),
            'age': patient_metadata.get('age'),
            'gender': patient_metadata.get('gender'),
            'dates': patient_metadata.get('dates', [])
        }
        print(f"\n✅ Using pre-extracted metadata from database")
    else:
        # Fallback: Extract patient info from chunks
        print("\n🔍 Extracting patient information from text...")
        full_text = "\n".join(chunks[:10])  # First 10 chunks usually have patient info
        patient_info = extract_patient_info(full_text)
    
    print(f"   Patient: {patient_info['name']}")
    print(f"   Age: {patient_info['age'] or 'N/A'}")
    print(f"   Gender: {patient_info['gender'] or 'N/A'}")
    print(f"   Dates: {', '.join(patient_info['dates'][:3])}..." if patient_info['dates'] else "   Dates: None")
    
    # Assemble context intelligently with adaptive sizing
    context = smart_context_assembly(
        chunks=chunks,
        query=question,
        index=index,
        vectorizer=vectorizer,
        num_reports=num_reports
    )
    
    # Generate optimized prompts
    print(f"\n📝 Generating optimized medical report summary prompt...")
    system_prompt, user_prompt = generate_medical_report_prompt(
        context,
        patient_info,
        num_reports
    )
    
    # Call OpenAI API
    try:
        summary = call_openai_api(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            num_reports=num_reports
        )
        
        print(f"✅ Summary generated successfully")
        print(f"   Length: {len(summary)} chars")
        print(f"{'='*80}\n")
        
        return summary
        
    except Exception as e:
        error = f"❌ Summary generation failed: {str(e)}"
        print(error)
        return error


# Backward compatibility
def ask_rag(question: str, temp_dir: str, top_k: int = 10, num_reports: int = 1):
    """Legacy function for backward compatibility"""
    return ask_rag_improved(
        question=question,
        temp_dir=temp_dir,
        folder_type='reports',
        num_reports=num_reports
    )