"""
Medical metadata extraction module utilizing OpenAI Structured Outputs 
with a regex-based fallback for redundancy.
"""

import os
import re
import asyncio
from typing import Optional, List, Tuple

from dateutil import parser as _dateutil_parser
from dateutil.parser import ParserError

from pydantic import BaseModel, field_validator
from openai import AsyncOpenAI

# --- Configuration ---

OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY")
MODEL_NAME: str = "gpt-4.1-nano"
_MAX_CONCURRENT: int = int(os.getenv("METADATA_MAX_CONCURRENT", "8"))


def _make_client() -> AsyncOpenAI:
    """Creates a new AsyncOpenAI client bound to the active event loop."""
    return AsyncOpenAI(
        api_key=OPENAI_API_KEY,
        timeout=25.0,
        max_retries=2,
    )


# --- Blocklists ---

_INVALID_NAMES: frozenset = frozenset(
    ["name", "patient", "sex", "age", "gender", "male", "female",
     "mr", "mrs", "ms", "dr", "test", "report", "unknown", "n/a",
     "null", "none", ""]
)
_INVALID_REPORT_TYPES: frozenset = frozenset(
    ["test", "report", "unknown", "null", "none", ""]
)
_INVALID_DOCTOR_NAMES: frozenset = frozenset(
    ["doctor", "dr", "unknown", "null", "none", ""]
)
_INVALID_HOSPITAL_NAMES: frozenset = frozenset(
    ["hospital", "clinic", "unknown", "null", "none", ""]
)


# --- Pydantic Schema ---

class MedicalMetadata(BaseModel):
    """Structured schema mapping for LLM metadata extraction."""
    patient_name:  Optional[str] = None
    age:           Optional[int] = None
    gender:        Optional[str] = None
    report_date:   Optional[str] = None
    report_type:   Optional[str] = None
    doctor_name:   Optional[str] = None
    hospital_name: Optional[str] = None

    @field_validator("patient_name", mode="before")
    @classmethod
    def clean_patient_name(cls, v):
        if not isinstance(v, str):
            return None
        v = v.strip()
        if v.lower() in _INVALID_NAMES or len(v) <= 2:
            return None
        if not re.search(r"[a-zA-Z]{2,}", v):
            return None
        return v

    @field_validator("age", mode="before")
    @classmethod
    def clean_age(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            m = re.search(r"\d+", v)
            v = int(m.group()) if m else None
        if isinstance(v, float):
            v = int(v)
        if isinstance(v, int):
            return v if 0 < v < 150 else None
        return None

    @field_validator("gender", mode="before")
    @classmethod
    def clean_gender(cls, v):
        if not isinstance(v, str):
            return None
        g = v.strip().lower()
        if "female" in g:
            return "Female"
        if "male" in g:
            return "Male"
        return None

    @field_validator("report_date", mode="before")
    @classmethod
    def clean_date(cls, v):
        if not isinstance(v, str):
            return None
        standardised = standardize_date(v.strip())
        return standardised if standardised else None

    @field_validator("report_type", mode="before")
    @classmethod
    def clean_report_type(cls, v):
        if not isinstance(v, str):
            return None
        v = v.strip()
        if len(v) <= 2 or v.lower() in _INVALID_REPORT_TYPES:
            return None
        return v

    @field_validator("doctor_name", mode="before")
    @classmethod
    def clean_doctor_name(cls, v):
        if not isinstance(v, str):
            return None
        v = v.strip()
        if len(v) <= 2 or v.lower() in _INVALID_DOCTOR_NAMES:
            return None
        return v

    @field_validator("hospital_name", mode="before")
    @classmethod
    def clean_hospital_name(cls, v):
        if not isinstance(v, str):
            return None
        v = v.strip()
        if len(v) <= 2 or v.lower() in _INVALID_HOSPITAL_NAMES:
            return None
        return v

    def to_pipeline_dict(self) -> dict:
        """Serializes model back to the pipeline's expected dict structure."""
        return {
            "patient_name":  self.patient_name,
            "age":           str(self.age) if self.age is not None else None,
            "gender":        self.gender,
            "report_date":   self.report_date,
            "report_type":   self.report_type,
            "doctor_name":   self.doctor_name,
            "hospital_name": self.hospital_name,
        }


# --- Prompt Templates ---

_SYSTEM_PROMPT: str = (
    "You are a medical metadata extractor. Extract patient info from reports.\n\n"
    "RULES:\n"
    "- patient_name: the actual person's name ONLY — never labels like "
      "'Patient', 'Name', 'Sex', 'Age'\n"
    "- age: integer years ONLY (e.g. 45, not '45 years')\n"
    "- gender: exactly 'Male', 'Female', or null\n"
    "- report_date: DD/MM/YYYY format\n"
    "- For any missing field return null\n"
    "- Be precise, never guess"
)


def _build_user_prompt(text_sample: str) -> str:
    return (
        "Extract metadata from this medical report header:\n\n"
        f"{text_sample}\n\n"
        "Return JSON with keys: patient_name, age, gender, report_date, "
        "report_type, doctor_name, hospital_name"
    )


# --- Confidence Helper ---

_TOTAL_FIELDS: int = 7


def _attach_confidence(result: dict, max_confidence: float = 1.0) -> dict:
    """Calculates extraction completeness confidence metrics."""
    fields_found = sum(
        1 for k, v in result.items()
        if k != "extraction_confidence" and v is not None and v != "Unknown"
    )
    confidence = min(fields_found / _TOTAL_FIELDS, max_confidence)

    name = result.get("patient_name")
    if name and name not in ("Unknown", None):
        confidence = max(confidence, 0.5)

    result["extraction_confidence"] = round(confidence, 2)
    return result


# --- Async Core ---

async def _async_extract_single(
    text: str,
    file_name: str,
    semaphore: asyncio.Semaphore,
    client: AsyncOpenAI,
) -> dict:
    """Worker handling single-document extraction via LLM with fallback handling."""
    text_sample = text[:800]

    async with semaphore:
        try:
            print(f"   🤖 [async] OpenAI structured call → {file_name or 'unknown'}")

            response = await client.beta.chat.completions.parse(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user",   "content": _build_user_prompt(text_sample)},
                ],
                response_format=MedicalMetadata,
                temperature=0.05,
                max_tokens=300,
            )

            parsed: Optional[MedicalMetadata] = response.choices.message.parsed

            if parsed is None:
                print(f"   ⚠️  Parsed result is None for {file_name} — using fallback")
                result = extract_metadata_fallback(text)
            else:
                result = parsed.to_pipeline_dict()
                result = _attach_confidence(result)

        except Exception as exc:
            print(f"   ⚠️  API error [{file_name}]: {exc} — using fallback")
            result = extract_metadata_fallback(text)

    print(f"   ✅ Metadata extracted [{file_name}]:")
    print(f"      Patient:    {result.get('patient_name', 'Unknown')}")
    print(f"      Age:        {result.get('age', 'N/A')}")
    print(f"      Date:       {result.get('report_date', 'N/A')}")
    print(f"      Type:       {result.get('report_type', 'N/A')}")
    print(f"      Confidence: {result.get('extraction_confidence', 0.0)}")

    return result


async def _run_single(text: str, file_name: str) -> dict:
    client = _make_client()
    semaphore = asyncio.Semaphore(_MAX_CONCURRENT)
    try:
        return await _async_extract_single(text, file_name, semaphore, client)
    finally:
        await client.close()


async def _run_batch(items: List[Tuple[str, str]]) -> List[dict]:
    client = _make_client()
    semaphore = asyncio.Semaphore(_MAX_CONCURRENT)
    tasks = [
        _async_extract_single(text, fname, semaphore, client)
        for text, fname in items
    ]
    try:
        return await asyncio.gather(*tasks)
    finally:
        await client.close()


# --- Public API Sync Wrappers ---

def extract_metadata_with_llm(
    text: str,
    file_name: str = None,
    retry_count: int = 0,
) -> dict:
    """Extract metadata synchronously from a single document text payload."""
    print(f"\n🔍 Extracting metadata with LLM ({MODEL_NAME})...")

    if not OPENAI_API_KEY:
        print("⚠️  OPENAI_API_KEY not set — falling back to regex extraction")
        return extract_metadata_fallback(text)

    try:
        return asyncio.run(
            _run_single(text, file_name or "unknown")
        )

    except RuntimeError as exc:
        print(f"   ⚠️  Active event loop detected ({exc}) — using regex fallback")
        return extract_metadata_fallback(text)

    except Exception as exc:
        print(f"   ⚠️  Unexpected error: {exc} — using fallback")
        return extract_metadata_fallback(text)


def extract_metadata_batch(
    items: List[Tuple[str, str]],
) -> List[dict]:
    """Execute concurrent batch metadata extraction for multiple documents."""
    if not items:
        return []

    print(f"\n🚀 Batch metadata extraction: {len(items)} documents "
          f"(max {_MAX_CONCURRENT} concurrent API calls)")

    if not OPENAI_API_KEY:
        print("⚠️  OPENAI_API_KEY not set — sequential regex fallback for all")
        return [extract_metadata_fallback(t) for t, _ in items]

    try:
        return asyncio.run(_run_batch(items))

    except RuntimeError as exc:
        print(f"   ⚠️  Active event loop ({exc}) — sequential fallback")
        return [extract_metadata_with_llm(t, n) for t, n in items]

    except Exception as exc:
        print(f"   ⚠️  Batch extraction failed ({exc}) — sequential fallback")
        return [extract_metadata_with_llm(t, n) for t, n in items]


# --- Date Standardization ---

def standardize_date(date_str: str) -> str:
    """Normalizes dates to DD/MM/YYYY. Requires 4-digit years to avoid guessing."""
    date_str = date_str.strip()

    if not re.search(r"\d{4}", date_str):
        return date_str

    try:
        parsed = _dateutil_parser.parse(date_str, dayfirst=True, yearfirst=False)
        return parsed.strftime("%d/%m/%Y")
    except (ParserError, ValueError, OverflowError):
        return date_str


# --- Regex Fallback ---

def extract_metadata_fallback(text: str) -> dict:
    """Pattern matching fallback for when the API is inaccessible or fails."""
    print("   ⚠️  Using fallback regex extraction")

    metadata: dict = {
        "patient_name":  None,
        "age":           None,
        "gender":        None,
        "report_date":   None,
        "report_type":   None,
        "doctor_name":   None,
        "hospital_name": None,
    }

    name_patterns = [
        r"Patient\s*Name\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
        r"Name\s*[:\-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
    ]
    for pat in name_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            name = m.group(1).strip()
            invalid = {"sex", "age", "male", "female", "gender", "date"}
            if len(name) > 2 and name.lower() not in invalid:
                metadata["patient_name"] = name
                break

    m = re.search(r"Age\s*[:\-]?\s*(\d+)", text, re.IGNORECASE)
    if m:
        metadata["age"] = m.group(1)

    if re.search(r"\b(Female|F)\b", text, re.IGNORECASE):
        metadata["gender"] = "Female"
    elif re.search(r"\b(Male|M)\b", text, re.IGNORECASE):
        metadata["gender"] = "Male"

    date_patterns = [
        r"Date\s*[:\-]?\s*(\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})",
        r"(\d{1,2}[/\-]\d{1,2}[/\-]\d{4})",
    ]
    for pat in date_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            metadata["report_date"] = standardize_date(m.group(1))
            break

    type_patterns = [
        r"(Complete Blood Count|CBC|Blood Test|Lipid Profile|"
        r"Kidney Function|Liver Function|Thyroid|X-Ray|MRI|CT Scan|Ultrasound)",
        r"Test\s*[:\-]?\s*([A-Za-z\s]+)",
    ]
    for pat in type_patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            metadata["report_type"] = m.group(1).strip()
            break

    _attach_confidence(metadata, max_confidence=0.6)

    return metadata


if __name__ == "__main__":
    _sample = """
    Patient Name: Rajesh Sharma
    Age: 45 Years
    Sex: Male
    Date: 15/01/2025

    COMPLETE BLOOD COUNT
    Hemoglobin: 14.5 g/dL
    WBC: 7,200 /µL
    Platelets: 2,50,000 /µL

    Referred by: Dr. Anita Verma
    Hospital: City Diagnostics Centre
    """

    print("=" * 60)
    print("SINGLE-DOC EXTRACTION TEST")
    print("=" * 60)
    result = extract_metadata_with_llm(_sample, "test_report.pdf")
    for k, v in result.items():
        print(f"  {k:30s}: {v}")

    print("\n" + "=" * 60)
    print("BATCH EXTRACTION TEST (2 docs concurrently)")
    print("=" * 60)
    batch = [
        (_sample, "report_A.pdf"),
        (_sample.replace("Rajesh Sharma", "Priya Patel").replace("Male", "Female"),
         "report_B.pdf"),
    ]
    batch_results = extract_metadata_batch(batch)
    for i, res in enumerate(batch_results, 1):
        print(f"\n  Doc {i}:")
        for k, v in res.items():
            print(f"    {k:30s}: {v}")