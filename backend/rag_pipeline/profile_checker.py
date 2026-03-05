# backend/rag_pipeline/profile_checker.py

import re
from difflib import SequenceMatcher


def normalize_name(name: str) -> str:
    """
    Normalize name for comparison
    - Remove prefixes (Mr, Mrs, Dr, etc.)
    - Remove suffixes (Jr, Sr, II, III)
    - Convert to lowercase
    - Remove extra spaces
    """
    if not name or not isinstance(name, str):
        return ""
    
    # Convert to lowercase and strip
    normalized = name.lower().strip()
    
    # Remove common prefixes
    prefixes = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sr', 'sra', 'srta']
    for prefix in prefixes:
        # Remove prefix with dot
        normalized = re.sub(f'^{prefix}\\.?\\s+', '', normalized)
    
    # Remove common suffixes
    suffixes = ['jr', 'sr', 'ii', 'iii', 'iv', 'esq', 'md', 'phd']
    for suffix in suffixes:
        normalized = re.sub(f'\\s+{suffix}\\.?$', '', normalized)
    
    # Remove extra spaces
    normalized = ' '.join(normalized.split())
    
    return normalized


def calculate_name_similarity(name1: str, name2: str) -> float:
    """
    Calculate similarity between two names (0.0 to 1.0)
    
    Strategies:
    1. Exact match after normalization
    2. One name contains the other (first/last name matching)
    3. Word overlap (matching components)
    4. Character-level similarity
    
    Returns:
        float: Similarity score (0.0 to 1.0)
    """
    if not name1 or not name2:
        return 0.0
    
    # Normalize both names
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)
    
    if not n1 or not n2:
        return 0.0
    
    # Exact match
    if n1 == n2:
        return 1.0
    
    # Split into words
    words1 = n1.split()
    words2 = n2.split()
    
    # One contains the other (e.g., "John" matches "John Doe")
    if n1 in n2 or n2 in n1:
        # Higher score if longer name contains shorter
        longer_len = max(len(n1), len(n2))
        shorter_len = min(len(n1), len(n2))
        return 0.75 + (shorter_len / longer_len) * 0.20  # 0.75 to 0.95
    
    # Word-level comparison
    if words1 and words2:
        # Calculate overlap
        common = set(words1) & set(words2)
        total = set(words1) | set(words2)
        
        if common:
            word_overlap = len(common) / len(total)
            
            # Check if first or last names match
            first_name_match = words1[0] == words2[0] if len(words1) > 0 and len(words2) > 0 else False
            last_name_match = words1[-1] == words2[-1] if len(words1) > 0 and len(words2) > 0 else False
            
            # Boost score for first/last name matches
            if first_name_match and last_name_match and len(common) >= 2:
                return 0.90  # Strong match
            elif first_name_match or last_name_match:
                return 0.70 + (word_overlap * 0.25)  # 0.70 to 0.95
            else:
                return 0.50 + (word_overlap * 0.30)  # 0.50 to 0.80
    
    # Character-level similarity (Levenshtein-like)
    char_similarity = SequenceMatcher(None, n1, n2).ratio()
    
    # Only accept high character similarity for names
    if char_similarity >= 0.8:
        return char_similarity
    
    return char_similarity * 0.7  # Reduce score for low character similarity


def verify_patient_name(report_name: str, profile_name: str, threshold: float = 0.75) -> dict:
    """
    Verify if report patient name matches user profile name
    
    Args:
        report_name: Name extracted from medical report
        profile_name: Name from user profile (ground truth)
        threshold: Minimum similarity to consider a match (default 0.75 - STRICT)
    
    Returns:
        {
            "match": bool,
            "confidence": float,
            "status": str,  # "matched", "mismatched", "unknown"
            "message": str,
            "normalized_report_name": str,
            "normalized_profile_name": str
        }
    """
    # Handle empty/invalid names
    if not report_name or str(report_name).lower() in ['unknown', 'patient', 'none', 'null', '', 'name', 'sex', 'age', 'gender']:
        return {
            "match": False,
            "confidence": 0.0,
            "status": "unknown",
            "message": "Patient name not found in report",
            "normalized_report_name": "",
            "normalized_profile_name": normalize_name(profile_name) if profile_name else ""
        }
    
    if not profile_name or str(profile_name).lower() in ['unknown', 'patient', 'none', 'null', '']:
        return {
            "match": False,
            "confidence": 0.0,
            "status": "unknown",
            "message": "User profile name not set",
            "normalized_report_name": normalize_name(report_name),
            "normalized_profile_name": ""
        }
    
    # Calculate similarity
    similarity = calculate_name_similarity(report_name, profile_name)
    
    # Determine match status with STRICT threshold
    if similarity >= threshold:
        status = "matched"
        match = True
        message = f"✅ Names match ({similarity*100:.0f}% confidence)"
    else:
        status = "mismatched"
        match = False
        message = f"❌ Names do NOT match (only {similarity*100:.0f}% similar). Report belongs to '{report_name}', but profile is '{profile_name}'"
    
    return {
        "match": match,
        "confidence": round(similarity, 3),
        "status": status,
        "message": message,
        "normalized_report_name": normalize_name(report_name),
        "normalized_profile_name": normalize_name(profile_name)
    }


def filter_reports_by_name(reports: list, profile_name: str, threshold: float = 0.75) -> dict:
    """
    Filter reports to only include those matching the user's name
    STRICT MODE - Rejects all mismatches
    
    Args:
        reports: List of report dicts with 'patient_name' field
        profile_name: User's profile name (ground truth)
        threshold: Similarity threshold (default 0.75 - STRICT)
    
    Returns:
        {
            "matched_reports": list,
            "mismatched_reports": list,
            "unknown_reports": list,
            "total": int,
            "matched_count": int,
            "mismatched_count": int,
            "unknown_count": int,
            "can_proceed": bool,
            "message": str,
            "different_patients": list  # List of different patient names found
        }
    """
    matched = []
    mismatched = []
    unknown = []
    different_patients = set()
    
    for report in reports:
        report_name = report.get('patient_name')
        
        verification = verify_patient_name(report_name, profile_name, threshold)
        
        # Add verification details to report
        report_with_verification = report.copy()
        report_with_verification['name_verification'] = verification
        
        if verification['status'] == 'matched':
            matched.append(report_with_verification)
        elif verification['status'] == 'mismatched':
            mismatched.append(report_with_verification)
            # Track different patient names
            if report_name:
                different_patients.add(report_name)
        else:  # unknown
            unknown.append(report_with_verification)
    
    total = len(reports)
    matched_count = len(matched)
    mismatched_count = len(mismatched)
    unknown_count = len(unknown)
    
    # STRICT MODE: Cannot proceed if ANY mismatches found
    can_proceed = matched_count > 0 and mismatched_count == 0
    
    # Generate detailed message
    if mismatched_count > 0:
        patient_list = ', '.join(f"'{p}'" for p in different_patients)
        message = (
            f"⚠️ CRITICAL: Found {mismatched_count} report(s) belonging to OTHER patients!\n"
            f"Your profile name: '{profile_name}'\n"
            f"Found reports for: {patient_list}\n\n"
            f"❌ Cannot generate summary until these reports are removed.\n"
            f"These reports do NOT belong to you!"
        )
    elif matched_count == 0:
        message = f"❌ No reports found matching your profile name '{profile_name}'"
    elif unknown_count > 0:
        message = (
            f"⚠️ Warning: {unknown_count} report(s) have unclear patient names.\n"
            f"✅ Proceeding with {matched_count} verified report(s) for '{profile_name}'"
        )
    else:
        message = f"✅ All {matched_count} report(s) verified successfully for '{profile_name}'"
    
    return {
        "matched_reports": matched,
        "mismatched_reports": mismatched,
        "unknown_reports": unknown,
        "total": total,
        "matched_count": matched_count,
        "mismatched_count": mismatched_count,
        "unknown_count": unknown_count,
        "can_proceed": can_proceed,
        "message": message,
        "different_patients": list(different_patients)
    }


def get_patient_distribution(reports: list) -> dict:
    """
    Analyze how many different patients are in the reports
    
    Returns:
        {
            "total_reports": int,
            "patient_names": dict,  # {name: count}
            "has_multiple_patients": bool,
            "primary_patient": str,  # Most common name
            "other_patients": list
        }
    """
    patient_counts = {}
    
    for report in reports:
        name = report.get('patient_name', 'Unknown')
        name = name.strip() if name else 'Unknown'
        
        if name.lower() not in ['unknown', 'patient', 'none', 'null', '', 'name']:
            normalized = normalize_name(name)
            if normalized:
                patient_counts[name] = patient_counts.get(name, 0) + 1
    
    if not patient_counts:
        return {
            "total_reports": len(reports),
            "patient_names": {},
            "has_multiple_patients": False,
            "primary_patient": None,
            "other_patients": []
        }
    
    # Sort by count
    sorted_patients = sorted(patient_counts.items(), key=lambda x: x[1], reverse=True)
    primary_patient = sorted_patients[0][0]
    other_patients = [name for name, count in sorted_patients[1:]]
    
    return {
        "total_reports": len(reports),
        "patient_names": patient_counts,
        "has_multiple_patients": len(patient_counts) > 1,
        "primary_patient": primary_patient,
        "other_patients": other_patients
    }


# Test function
if __name__ == "__main__":
    # Test cases
    test_cases = [
        ("Rajesh Sharma", "Rajesh Sharma"),           # Exact match
        ("rajesh sharma", "Rajesh Sharma"),           # Case insensitive
        ("Mr. Rajesh Sharma", "Rajesh Sharma"),       # With prefix
        ("Rajesh Kumar Sharma", "Rajesh Sharma"),     # Middle name
        ("Rajesh", "Rajesh Sharma"),                  # First name only
        ("Sharma", "Rajesh Sharma"),                  # Last name only
        ("Rajesh K Sharma", "Rajesh Sharma"),         # Initial
        ("John Doe", "Rajesh Sharma"),                # Different person
        ("Jane Smith", "Rajesh Sharma"),              # Different person
        ("Unknown", "Rajesh Sharma"),                 # Unknown
        ("Sex", "Rajesh Sharma"),                     # Invalid
    ]
    
    print("\n" + "="*80)
    print("NAME VERIFICATION TESTS (STRICT MODE)")
    print("="*80)
    
    for report_name, profile_name in test_cases:
        result = verify_patient_name(report_name, profile_name)
        status_icon = "✅" if result['match'] else "❌"
        print(f"\n{status_icon} '{report_name}' vs '{profile_name}'")
        print(f"   Status: {result['status'].upper()} ({result['confidence']:.2f})")
        print(f"   {result['message']}")
    
    print("\n" + "="*80)
    print("FILTER REPORTS TEST")
    print("="*80)
    
    test_reports = [
        {"id": 1, "patient_name": "Rajesh Sharma", "file_name": "report1.pdf"},
        {"id": 2, "patient_name": "Mr. Rajesh Sharma", "file_name": "report2.pdf"},
        {"id": 3, "patient_name": "Priya Patel", "file_name": "report3.pdf"},  # Different person!
        {"id": 4, "patient_name": "Unknown", "file_name": "report4.pdf"},
        {"id": 5, "patient_name": "Rajesh K Sharma", "file_name": "report5.pdf"},
    ]
    
    result = filter_reports_by_name(test_reports, "Rajesh Sharma")
    
    print(f"\nProfile Name: Rajesh Sharma")
    print(f"Total Reports: {result['total']}")
    print(f"✅ Matched: {result['matched_count']}")
    print(f"❌ Mismatched: {result['mismatched_count']}")
    print(f"❓ Unknown: {result['unknown_count']}")
    print(f"\nCan Proceed: {result['can_proceed']}")
    print(f"\nMessage:\n{result['message']}")
    
    if result['different_patients']:
        print(f"\n⚠️  Different patients found: {', '.join(result['different_patients'])}")
    
    print("\nMatched Reports:")
    for r in result['matched_reports']:
        print(f"  ✅ {r['file_name']}: {r['patient_name']} ({r['name_verification']['confidence']:.2f})")
    
    print("\nMismatched Reports (WRONG PERSON!):")
    for r in result['mismatched_reports']:
        print(f"  ❌ {r['file_name']}: {r['patient_name']} ({r['name_verification']['confidence']:.2f})")
    
    # Test patient distribution
    print("\n" + "="*80)
    print("PATIENT DISTRIBUTION TEST")
    print("="*80)
    
    dist = get_patient_distribution(test_reports)
    print(f"\nTotal Reports: {dist['total_reports']}")
    print(f"Multiple Patients: {dist['has_multiple_patients']}")
    print(f"Primary Patient: {dist['primary_patient']}")
    print(f"\nPatient Distribution:")
    for name, count in dist['patient_names'].items():
        print(f"  • {name}: {count} report(s)")
    
    if dist['other_patients']:
        print(f"\n⚠️  Other patients found: {', '.join(dist['other_patients'])}")