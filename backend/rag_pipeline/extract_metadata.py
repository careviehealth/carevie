# backend/rag_pipeline/extract_metadata.py

import os
import requests
import json
import re
from datetime import datetime

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"

# Using GPT-4.1-nano for metadata extraction
MODEL_NAME = "gpt-4.1-nano"


def extract_metadata_with_llm(text: str, file_name: str = None, retry_count: int = 0) -> dict:
    """
    Extract metadata from medical report text using LLM
    
    OPTIMIZED for llama-3.1-8b-instant:
    - Shorter, clearer prompts
    - Explicit JSON schema
    - Better error handling
    
    Args:
        text: Extracted text from medical report
        file_name: Original filename for context
        retry_count: Internal retry counter
    
    Returns:
        {
            "patient_name": str,
            "age": str or None,
            "gender": str or None,
            "report_date": str or None,
            "report_type": str or None,
            "doctor_name": str or None,
            "hospital_name": str or None,
            "extraction_confidence": float (0.0-1.0)
        }
    """
    print(f"\n🔍 Extracting metadata with LLM ({MODEL_NAME})...")
    
    if not OPENAI_API_KEY:
        print("⚠️  OPENAI_API_KEY not set - falling back to regex")
        return extract_metadata_fallback(text)
    
    # Limit text for metadata extraction
    # OPTIMIZED: Use first 800 chars (headers usually contain all metadata)
    text_sample = text[:800] if len(text) > 800 else text
    
    # OPTIMIZED: Shorter, more explicit system prompt
    system_prompt = """You are a medical metadata extractor. Extract patient info from reports.

OUTPUT: Valid JSON only, no explanations.

RULES:
- If field not found: use null
- Patient name: actual person's name (NOT "Name", "Patient", "Sex")
- Date format: DD/MM/YYYY
- Be precise, don't guess

EXAMPLE:
{
  "patient_name": "Rajesh Kumar",
  "age": "45",
  "gender": "Male",
  "report_date": "15/01/2025",
  "report_type": "Blood Test",
  "doctor_name": "Dr. Sharma",
  "hospital_name": "City Hospital"
}"""

    # OPTIMIZED: Shorter user prompt
    user_prompt = f"""Extract metadata from this medical report header:

{text_sample}

Return JSON with: patient_name, age, gender, report_date, report_type, doctor_name, hospital_name"""
    
    try:
        print("   🤖 Calling OpenAI API for metadata...")
        
        payload = {
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "model": MODEL_NAME,
            "temperature": 0.05,  # Very low for extraction accuracy
            "max_tokens": 300,  # Metadata is small
            "response_format": {"type": "json_object"}
        }
        
        headers = {
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(
            OPENAI_CHAT_URL,
            json=payload,
            headers=headers,
            timeout=20  # OpenAI timeout
        )
        response.raise_for_status()
        
        result = response.json()
        content = result["choices"][0]["message"]["content"]
        
        # Parse JSON response
        metadata = json.loads(content)
        
        # Validate and clean
        cleaned_metadata = validate_metadata(metadata)
        
        # Calculate extraction confidence based on fields found
        fields_found = sum(1 for v in cleaned_metadata.values() if v is not None and v != 'Unknown')
        total_fields = 7  # patient_name, age, gender, date, type, doctor, hospital
        confidence = min(fields_found / total_fields, 1.0)
        
        # Boost confidence if critical fields are present
        if cleaned_metadata.get('patient_name') and cleaned_metadata.get('patient_name') != 'Unknown':
            confidence = max(confidence, 0.5)
        
        cleaned_metadata['extraction_confidence'] = round(confidence, 2)
        
        print("   ✅ Metadata extracted:")
        print(f"      Patient: {cleaned_metadata.get('patient_name', 'Unknown')}")
        print(f"      Age: {cleaned_metadata.get('age', 'N/A')}")
        print(f"      Date: {cleaned_metadata.get('report_date', 'N/A')}")
        print(f"      Type: {cleaned_metadata.get('report_type', 'N/A')}")
        print(f"      Confidence: {cleaned_metadata['extraction_confidence']}")
        
        return cleaned_metadata
        
    except requests.exceptions.Timeout:
        print("   ⚠️  LLM timeout - falling back to regex")
        return extract_metadata_fallback(text)
        
    except requests.exceptions.RequestException as e:
        print(f"   ⚠️  LLM API error: {e} - falling back to regex")
        return extract_metadata_fallback(text)
        
    except json.JSONDecodeError as e:
        print(f"   ⚠️  JSON parse error: {e}")
        # Retry once with fallback
        if retry_count == 0:
            print("   🔄 Retrying with fallback...")
            return extract_metadata_fallback(text)
        return extract_metadata_fallback(text)
        
    except Exception as e:
        print(f"   ⚠️  Unexpected error: {e} - falling back to regex")
        return extract_metadata_fallback(text)


def validate_metadata(metadata: dict) -> dict:
    """
    Validate and clean extracted metadata
    """
    cleaned = {}
    
    # Patient name validation
    name = metadata.get('patient_name')
    if name and isinstance(name, str):
        name = name.strip()
        # Filter out common false positives
        invalid_names = ['name', 'patient', 'sex', 'age', 'gender', 'male', 'female', 
                        'mr', 'mrs', 'ms', 'dr', 'test', 'report', 'unknown', 'n/a',
                        'null', 'none', '']
        
        if name.lower() not in invalid_names and len(name) > 2:
            # Check if name has at least one letter
            if re.search(r'[a-zA-Z]{2,}', name):
                cleaned['patient_name'] = name
            else:
                cleaned['patient_name'] = None
        else:
            cleaned['patient_name'] = None
    else:
        cleaned['patient_name'] = None
    
    # Age validation
    age = metadata.get('age')
    if age:
        # Extract just the number
        age_match = re.search(r'\d+', str(age))
        if age_match:
            age_num = int(age_match.group())
            if 0 < age_num < 150:  # Reasonable age range
                cleaned['age'] = str(age_num)
            else:
                cleaned['age'] = None
        else:
            cleaned['age'] = None
    else:
        cleaned['age'] = None
    
    # Gender validation
    gender = metadata.get('gender')
    if gender and isinstance(gender, str):
        gender_lower = gender.lower()
        if 'male' in gender_lower and 'female' not in gender_lower:
            cleaned['gender'] = 'Male'
        elif 'female' in gender_lower:
            cleaned['gender'] = 'Female'
        else:
            cleaned['gender'] = None
    else:
        cleaned['gender'] = None
    
    # Date validation and standardization
    report_date = metadata.get('report_date')
    if report_date and isinstance(report_date, str):
        cleaned['report_date'] = standardize_date(report_date)
    else:
        cleaned['report_date'] = None
    
    # Report type
    report_type = metadata.get('report_type')
    if report_type and isinstance(report_type, str) and len(report_type) > 2:
        # Clean up report type
        rt = report_type.strip()
        if rt.lower() not in ['test', 'report', 'unknown', 'null', 'none', '']:
            cleaned['report_type'] = rt
        else:
            cleaned['report_type'] = None
    else:
        cleaned['report_type'] = None
    
    # Doctor name
    doctor = metadata.get('doctor_name')
    if doctor and isinstance(doctor, str) and len(doctor) > 2:
        doc = doctor.strip()
        if doc.lower() not in ['doctor', 'dr', 'unknown', 'null', 'none', '']:
            cleaned['doctor_name'] = doc
        else:
            cleaned['doctor_name'] = None
    else:
        cleaned['doctor_name'] = None
    
    # Hospital name
    hospital = metadata.get('hospital_name')
    if hospital and isinstance(hospital, str) and len(hospital) > 2:
        hosp = hospital.strip()
        if hosp.lower() not in ['hospital', 'clinic', 'unknown', 'null', 'none', '']:
            cleaned['hospital_name'] = hosp
        else:
            cleaned['hospital_name'] = None
    else:
        cleaned['hospital_name'] = None
    
    return cleaned


def standardize_date(date_str: str) -> str:
    """
    Try to standardize date to DD/MM/YYYY format
    """
    date_str = date_str.strip()
    
    # Common date patterns
    patterns = [
        (r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', 'dmy'),  # DD/MM/YYYY or DD-MM-YYYY
        (r'(\d{4})[/-](\d{1,2})[/-](\d{1,2})', 'ymd'),  # YYYY/MM/DD or YYYY-MM-DD
        (r'(\d{1,2})[/-](\d{1,2})[/-](\d{2})', 'dmy2'),  # DD/MM/YY
    ]
    
    for pattern, date_type in patterns:
        match = re.search(pattern, date_str)
        if match:
            if date_type == 'dmy':
                day, month, year = match.groups()
                return f"{int(day):02d}/{int(month):02d}/{year}"
            elif date_type == 'ymd':
                year, month, day = match.groups()
                return f"{int(day):02d}/{int(month):02d}/{year}"
            elif date_type == 'dmy2':
                day, month, year = match.groups()
                # Assume 20xx for 2-digit years
                full_year = f"20{year}" if int(year) < 50 else f"19{year}"
                return f"{int(day):02d}/{int(month):02d}/{full_year}"
    
    # If no pattern matches, return as-is
    return date_str


def extract_metadata_fallback(text: str) -> dict:
    """
    Fallback regex-based extraction (less accurate)
    """
    print("   ⚠️  Using fallback regex extraction")
    
    metadata = {
        'patient_name': None,
        'age': None,
        'gender': None,
        'report_date': None,
        'report_type': None,
        'doctor_name': None,
        'hospital_name': None
    }
    
    # Try to extract patient name
    name_patterns = [
        r"Patient\s*Name\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
        r"Name\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
    ]
    
    for pattern in name_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            invalid = ['sex', 'age', 'male', 'female', 'gender', 'date']
            if len(name) > 2 and name.lower() not in invalid:
                metadata['patient_name'] = name
                break
    
    # Try to extract age
    age_match = re.search(r"Age\s*[:\-]?\s*(\d+)", text, re.IGNORECASE)
    if age_match:
        metadata['age'] = age_match.group(1)
    
    # Try to extract gender
    if re.search(r'\b(Male|M)\b', text, re.IGNORECASE):
        metadata['gender'] = 'Male'
    elif re.search(r'\b(Female|F)\b', text, re.IGNORECASE):
        metadata['gender'] = 'Female'
    
    # Try to extract date
    date_patterns = [
        r"Date\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        r"(\d{1,2}[/-]\d{1,2}[/-]\d{4})",
    ]
    
    for pattern in date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            metadata['report_date'] = standardize_date(match.group(1))
            break
    
    # Try to extract report type
    type_patterns = [
        r"(Complete Blood Count|CBC|Blood Test|Lipid Profile|Kidney Function|Liver Function)",
        r"Test:\s*([A-Za-z\s]+)",
    ]
    
    for pattern in type_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            metadata['report_type'] = match.group(1).strip()
            break
    
    # Calculate confidence based on what was found
    fields_found = sum(1 for v in metadata.values() if v is not None)
    confidence = min(fields_found / 7, 0.6)  # Max 60% for regex (less reliable)
    metadata['extraction_confidence'] = round(confidence, 2)
    
    return metadata


# Test function
if __name__ == "__main__":
    test_text = """
    Patient Name: Rajesh Sharma
    Age: 45 Years
    Sex: Male
    Date: 15/01/2025
    
    COMPLETE BLOOD COUNT
    Hemoglobin: 14.5 g/dL
    """
    
    print("Testing metadata extraction...")
    result = extract_metadata_with_llm(test_text)
    
    print("\n" + "="*60)
    print("EXTRACTED METADATA:")
    print("="*60)
    for key, value in result.items():
        print(f"{key}: {value}")