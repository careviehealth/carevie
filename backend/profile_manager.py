# backend/profile_manager.py

import os
from supabase import create_client, Client
from difflib import SequenceMatcher
import re

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


# ============================================
# USER PROFILE MANAGEMENT
# ============================================

def get_user_profile(user_id: str) -> dict:
    """
    Get or create user profile
    
    NOTE: user_id can be TEXT or UUID string, we handle both
    """
    print(f"\n👤 Getting user profile: {user_id}")
    
    try:
        # Ensure user_id is string
        user_id_str = str(user_id)
        
        # user_profiles.user_id is UUID, so we need to convert
        # But medical_reports_processed.user_id is TEXT
        # We'll query using the UUID from personal table
        
        result = supabase.table('user_profiles').select('*').eq(
            'user_id', user_id_str
        ).execute()
        
        if result.data:
            profile = result.data[0]
            print(f"✅ Profile found: {profile.get('full_name')}")
            return profile
        else:
            print("ℹ️  No profile found - will need to create one")
            return None
            
    except Exception as e:
        print(f"❌ Error fetching profile: {e}")
        return None


def create_user_profile(user_id: str, full_name: str, **kwargs) -> dict:
    """
    Create user profile
    
    NOTE: user_id must be valid UUID (from personal.id)
    """
    print(f"\n✨ Creating user profile...")
    
    try:
        # Ensure user_id is string (UUID format expected)
        user_id_str = str(user_id)
        
        data = {
            'user_id': user_id_str,
            'full_name': full_name,
            'date_of_birth': kwargs.get('date_of_birth'),
            'gender': kwargs.get('gender'),
            'email': kwargs.get('email'),
            'phone': kwargs.get('phone'),
            'allow_name_mismatch': kwargs.get('allow_name_mismatch', False),
            'auto_delete_mismatch': kwargs.get('auto_delete_mismatch', False)
        }
        
        result = supabase.table('user_profiles').insert(data).execute()
        
        profile = result.data[0]
        print(f"✅ Profile created: {profile.get('full_name')}")
        return profile
        
    except Exception as e:
        print(f"❌ Error creating profile: {e}")
        raise


def update_user_profile(user_id: str, **updates) -> dict:
    """
    Update user profile
    
    NOTE: user_id must be valid UUID
    """
    print(f"\n🔄 Updating user profile...")
    
    try:
        user_id_str = str(user_id)
        
        result = supabase.table('user_profiles').update(updates).eq(
            'user_id', user_id_str
        ).execute()
        
        if result.data:
            profile = result.data[0]
            print(f"✅ Profile updated")
            return profile
        else:
            raise Exception("Profile not found")
            
    except Exception as e:
        print(f"❌ Error updating profile: {e}")
        raise


# ============================================
# NAME VERIFICATION
# ============================================

def calculate_name_similarity(name1: str, name2: str) -> float:
    """
    Calculate similarity between two names (0.0 to 1.0)
    
    Uses multiple strategies:
    1. Exact match
    2. Case-insensitive match
    3. Contains/substring match
    4. Word overlap
    5. Sequence matching (Levenshtein-like)
    """
    if not name1 or not name2:
        return 0.0
    
    # Normalize
    n1 = name1.strip().lower()
    n2 = name2.strip().lower()
    
    # Exact match
    if n1 == n2:
        return 1.0
    
    # Remove common prefixes/suffixes
    prefixes = ['mr', 'mrs', 'ms', 'dr', 'prof']
    suffixes = ['jr', 'sr', 'ii', 'iii']
    
    n1_clean = n1
    n2_clean = n2
    
    for prefix in prefixes:
        n1_clean = re.sub(f'^{prefix}\\.?\\s+', '', n1_clean)
        n2_clean = re.sub(f'^{prefix}\\.?\\s+', '', n2_clean)
    
    for suffix in suffixes:
        n1_clean = re.sub(f'\\s+{suffix}\\.?$', '', n1_clean)
        n2_clean = re.sub(f'\\s+{suffix}\\.?$', '', n2_clean)
    
    # After cleaning, check exact match again
    if n1_clean == n2_clean:
        return 1.0
    
    # Substring match (one contains the other)
    if n1_clean in n2_clean or n2_clean in n1_clean:
        return 0.85
    
    # Word overlap
    words1 = set(n1_clean.split())
    words2 = set(n2_clean.split())
    
    if words1 and words2:
        overlap = len(words1 & words2)
        total_unique = len(words1 | words2)
        word_similarity = overlap / total_unique if total_unique > 0 else 0
        
        if word_similarity >= 0.5:  # At least 50% word overlap
            return 0.75 + (word_similarity * 0.2)  # 0.75 to 0.95
    
    # Sequence matching (character-level similarity)
    sequence_sim = SequenceMatcher(None, n1_clean, n2_clean).ratio()
    
    return round(sequence_sim, 2)


def verify_patient_name(report_patient_name: str, profile_patient_name: str, 
                       threshold: float = 0.7) -> dict:
    """
    Verify if report patient name matches profile
    
    Args:
        report_patient_name: Name extracted from medical report
        profile_patient_name: Name from user profile
        threshold: Minimum similarity to consider a match (default 0.7)
    
    Returns:
        {
            "match": bool,
            "confidence": float,
            "status": str,  # "matched", "mismatched", "unknown"
            "message": str
        }
    """
    print(f"\n🔍 Verifying patient name...")
    print(f"   Report: '{report_patient_name}'")
    print(f"   Profile: '{profile_patient_name}'")
    
    # Handle missing names
    if not report_patient_name or report_patient_name.lower() in ['unknown', 'patient', 'none']:
        return {
            "match": False,
            "confidence": 0.0,
            "status": "unknown",
            "message": "Patient name not found in report"
        }
    
    if not profile_patient_name:
        return {
            "match": False,
            "confidence": 0.0,
            "status": "unknown",
            "message": "User profile not set up"
        }
    
    # Calculate similarity
    similarity = calculate_name_similarity(report_patient_name, profile_patient_name)
    
    print(f"   Similarity: {similarity:.2f} (threshold: {threshold})")
    
    # Determine match status
    if similarity >= threshold:
        status = "matched"
        match = True
        message = f"Names match with {similarity*100:.0f}% confidence"
        print(f"   ✅ {message}")
    else:
        status = "mismatched"
        match = False
        message = f"Names do not match (only {similarity*100:.0f}% similar)"
        print(f"   ⚠️  {message}")
    
    return {
        "match": match,
        "confidence": round(similarity, 2),
        "status": status,
        "message": message
    }


def update_report_verification_status(report_id: str, status: str, confidence: float):
    """Update verification status in database"""
    print(f"\n💾 Updating verification status: {status} ({confidence:.2f})")
    
    try:
        result = supabase.table('medical_reports_processed').update({
            'name_match_status': status,
            'name_match_confidence': confidence
        }).eq('id', report_id).execute()
        
        print(f"✅ Status updated")
        return True
        
    except Exception as e:
        print(f"❌ Error updating status: {e}")
        return False


def get_mismatched_reports(user_id: str) -> list:
    """Get all reports with name mismatches for a user"""
    print(f"\n🔍 Checking for mismatched reports...")
    
    try:
        result = supabase.table('medical_reports_processed').select('*').eq(
            'user_id', user_id
        ).eq('name_match_status', 'mismatched').execute()
        
        count = len(result.data)
        print(f"⚠️  Found {count} mismatched report(s)")
        
        return result.data
        
    except Exception as e:
        print(f"❌ Error fetching mismatched reports: {e}")
        return []


def delete_mismatched_reports(user_id: str) -> int:
    """Delete all mismatched reports for a user"""
    print(f"\n🗑️  Deleting mismatched reports...")
    
    try:
        result = supabase.table('medical_reports_processed').delete().eq(
            'user_id', user_id
        ).eq('name_match_status', 'mismatched').execute()
        
        deleted = len(result.data) if result.data else 0
        print(f"✅ Deleted {deleted} mismatched report(s)")
        
        return deleted
        
    except Exception as e:
        print(f"❌ Error deleting reports: {e}")
        return 0


def verify_reports_for_summary(user_id: str, folder_type: str = None) -> dict:
    """
    Verify all reports before generating summary
    
    Returns:
        {
            "can_generate": bool,
            "matched_count": int,
            "mismatched_count": int,
            "mismatched_reports": list,
            "message": str
        }
    """
    print(f"\n🔐 Verifying reports for summary generation...")
    
    # Get user profile
    profile = get_user_profile(user_id)
    
    if not profile:
        return {
            "can_generate": False,
            "matched_count": 0,
            "mismatched_count": 0,
            "mismatched_reports": [],
            "message": "User profile not set up. Please create profile first."
        }
    
    # Get all reports
    try:
        query = supabase.table('medical_reports_processed').select('*').eq(
            'user_id', user_id
        ).eq('processing_status', 'completed')
        
        if folder_type:
            query = query.eq('folder_type', folder_type)
        
        result = query.execute()
        reports = result.data
        
    except Exception as e:
        return {
            "can_generate": False,
            "matched_count": 0,
            "mismatched_count": 0,
            "mismatched_reports": [],
            "message": f"Error fetching reports: {str(e)}"
        }
    
    # Count verification status
    matched = [r for r in reports if r.get('name_match_status') == 'matched']
    mismatched = [r for r in reports if r.get('name_match_status') == 'mismatched']
    verified = [r for r in reports if r.get('name_match_status') == 'verified']
    
    matched_count = len(matched) + len(verified)
    mismatched_count = len(mismatched)
    
    print(f"   ✅ Matched: {matched_count}")
    print(f"   ⚠️  Mismatched: {mismatched_count}")
    
    # Check if user allows mismatches
    allow_mismatch = profile.get('allow_name_mismatch', False)
    
    if mismatched_count > 0 and not allow_mismatch:
        return {
            "can_generate": False,
            "matched_count": matched_count,
            "mismatched_count": mismatched_count,
            "mismatched_reports": [
                {
                    "file_name": r['file_name'],
                    "patient_name": r.get('patient_name'),
                    "confidence": r.get('name_match_confidence')
                }
                for r in mismatched
            ],
            "message": f"Found {mismatched_count} report(s) with name mismatch. Please verify or enable 'allow_name_mismatch' in settings."
        }
    
    if matched_count == 0:
        return {
            "can_generate": False,
            "matched_count": 0,
            "mismatched_count": mismatched_count,
            "mismatched_reports": [],
            "message": "No verified reports found to generate summary."
        }
    
    return {
        "can_generate": True,
        "matched_count": matched_count,
        "mismatched_count": mismatched_count,
        "mismatched_reports": [],
        "message": f"Ready to generate summary from {matched_count} verified report(s)."
    }


# ============================================
# TEST
# ============================================

if __name__ == "__main__":
    # Test name similarity
    test_pairs = [
        ("Rajesh Sharma", "Rajesh Sharma"),
        ("Rajesh Sharma", "rajesh sharma"),
        ("Dr. Rajesh Sharma", "Rajesh Sharma"),
        ("Rajesh Kumar Sharma", "Rajesh Sharma"),
        ("Rajesh", "Rajesh Kumar"),
        ("Rajesh Sharma", "Ramesh Sharma"),
        ("Rajesh Sharma", "John Doe"),
        ("Sex", "Rajesh Sharma"),
    ]
    
    print("\n" + "="*60)
    print("NAME SIMILARITY TESTS")
    print("="*60)
    
    for name1, name2 in test_pairs:
        similarity = calculate_name_similarity(name1, name2)
        result = verify_patient_name(name1, name2)
        print(f"\n'{name1}' vs '{name2}'")
        print(f"  Similarity: {similarity:.2f}")
        print(f"  Match: {result['match']} ({result['status']})")