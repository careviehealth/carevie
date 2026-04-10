from __future__ import annotations
import re
from difflib import SequenceMatcher
from typing import Optional

# Performance optimization: use rapidfuzz if installed, otherwise fallback to stdlib
try:
    from rapidfuzz import fuzz as _rf_fuzz
    def _char_similarity(a: str, b: str) -> float:
        return _rf_fuzz.ratio(a, b) / 100.0
except ImportError:
    def _char_similarity(a: str, b: str) -> float:
        return SequenceMatcher(None, a, b).ratio()

# Pre-compiled regex for efficient name cleaning
_PREFIX_RE = re.compile(r"^(?:mr|mrs|ms|miss|dr|prof|sr|sra|srta)\.?\s+", re.IGNORECASE)
_SUFFIX_RE = re.compile(r"\s+(?:jr|sr|ii|iii|iv|esq|md|phd)\.?$", re.IGNORECASE)

# Sentinel values for unidentified names
INVALID_NAME_TOKENS = frozenset({"unknown", "patient", "none", "null", "", "name", "sex", "age", "gender"})
_INVALID_REPORT_NAME_TOKENS = INVALID_NAME_TOKENS
_INVALID_PROFILE_NAME_TOKENS = frozenset({"unknown", "patient", "none", "null", ""})

def normalize_name(name: str) -> str:
    """Strip honorifics, suffixes, and normalize whitespace/casing."""
    if not name or not isinstance(name, str):
        return ""
    normalized = _PREFIX_RE.sub("", name.lower().strip())
    normalized = _SUFFIX_RE.sub("", normalized)
    return " ".join(normalized.split())

def _similarity_normalized(n1: str, n2: str) -> float:
    """Internal core: calculates similarity between pre-normalized strings."""
    if n1 == n2:
        return 1.0

    words1, words2 = n1.split(), n2.split()
    set1, set2 = frozenset(words1), frozenset(words2)

    # Word-token containment (handles "First Last" vs "First")
    shorter, longer = (set1, set2) if len(set1) <= len(set2) else (set2, set1)
    if shorter and shorter.issubset(longer):
        return 0.75 + (len(shorter) / len(longer)) * 0.20

    # Jaccard overlap with positional bonuses
    common = set1 & set2
    if common:
        union = set1 | set2
        overlap = len(common) / len(union)
        first_match = bool(words1 and words2 and words1[0] == words2[0])
        last_match = bool(words1 and words2 and words1[-1] == words2[-1])

        if first_match and last_match and len(common) >= 2: return 0.90
        if first_match or last_match: return min(0.95, 0.70 + overlap * 0.25)
        return min(0.80, 0.50 + overlap * 0.30)

    # Fallback to character-level distance
    sim = _char_similarity(n1, n2)
    return sim if sim >= 0.8 else sim * 0.7

def verify_patient_name(report_name: str, profile_name: str, threshold: float = 0.75) -> dict:
    """Verify if a report belongs to the profile user based on name similarity."""
    norm_report = normalize_name(str(report_name) if report_name else "")
    norm_profile = normalize_name(str(profile_name) if profile_name else "")

    if not norm_report or norm_report in _INVALID_REPORT_NAME_TOKENS:
        return {"match": False, "confidence": 0.0, "status": "unknown", "message": "Name not found", "normalized_report_name": "", "normalized_profile_name": norm_profile}

    if not norm_profile or norm_profile in _INVALID_PROFILE_NAME_TOKENS:
        return {"match": False, "confidence": 0.0, "status": "unknown", "message": "Profile name unset", "normalized_report_name": norm_report, "normalized_profile_name": ""}

    similarity = _similarity_normalized(norm_report, norm_profile)
    match = similarity >= threshold

    return {
        "match": match,
        "confidence": round(similarity, 3),
        "status": "matched" if match else "mismatched",
        "message": f"{'✅' if match else '❌'} Confidence: {similarity*100:.0f}%",
        "normalized_report_name": norm_report,
        "normalized_profile_name": norm_profile
    }

def filter_reports_by_name(reports: list, profile_name: str, threshold: float = 0.75) -> dict:
    """Filter a list of reports, strictly blocking if any belong to a different patient."""
    res = {"matched": [], "mismatched": [], "unknown": [], "diff": set()}

    for r in reports:
        v = verify_patient_name(r.get("patient_name"), profile_name, threshold)
        r_v = {**r, "name_verification": v}
        
        if v["status"] == "matched": res["matched"].append(r_v)
        elif v["status"] == "mismatched":
            res["mismatched"].append(r_v)
            if r.get("patient_name"): res["diff"].add(r.get("patient_name"))
        else: res["unknown"].append(r_v)

    can_proceed = len(res["matched"]) > 0 and len(res["mismatched"]) == 0
    return {
        "matched_reports": res["matched"],
        "mismatched_reports": res["mismatched"],
        "unknown_reports": res["unknown"],
        "can_proceed": can_proceed,
        "total": len(reports),
        "matched_count": len(res["matched"]),
        "mismatched_count": len(res["mismatched"]),
        "unknown_count": len(res["unknown"]),
        "different_patients": list(res["diff"])
    }

def get_patient_distribution(reports: list) -> dict:
    """Analyze the frequency of distinct patient names in a dataset."""
    counts = {}
    for r in reports:
        raw = r.get("patient_name")
        if raw and raw.lower().strip() not in _INVALID_REPORT_NAME_TOKENS:
            counts[raw] = counts.get(raw, 0) + 1

    if not counts:
        return {"total_reports": len(reports), "patient_names": {}, "has_multiple_patients": False, "primary_patient": None}

    sorted_names = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    return {
        "total_reports": len(reports),
        "patient_names": counts,
        "has_multiple_patients": len(counts) > 1,
        "primary_patient": sorted_names[0][0],
        "other_patients": [n for n, _ in sorted_names[1:]]
    }