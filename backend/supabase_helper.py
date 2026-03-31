# backend/supabase_helper.py

import os
from supabase import create_client, Client
from dotenv import load_dotenv
import requests
import hashlib
import io

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
print(f"✅ Supabase client initialized: {SUPABASE_URL}")

BUCKET_NAME = "medical-vault"


# ============================================
# FILE LISTING
# ============================================

def list_user_files(profile_id: str, folder_type: str = None):
    """List files from Supabase Storage for a profile."""
    print(f"\n📂 Listing files for profile: {profile_id}")
    if folder_type:
        print(f"   Folder: {folder_type}")
    
    try:
        if folder_type:
            folder_path = f"{profile_id}/{folder_type}"
        else:
            folder_path = f"{profile_id}"
        
        response = supabase.storage.from_(BUCKET_NAME).list(folder_path)
        
        # Filter out folders, keep only files
        files = [f for f in response if f.get('metadata')]
        
        print(f"✅ Found {len(files)} files")
        for f in files:
            print(f"   • {f.get('name')}")
        
        return files
        
    except Exception as e:
        print(f"❌ Error listing files: {e}")
        return []


# ============================================
# IN-MEMORY FILE ACCESS (NO LOCAL STORAGE)
# ============================================

def get_file_bytes(file_path: str) -> bytes:
    """
    Get file content as bytes directly from Supabase Storage.
    NEVER downloads to disk.

    Args:
        file_path: Full path in storage (e.g., "user_id/reports/file.pdf")

    Returns:
        File content as bytes (in memory)
    """
    print(f"📥 Fetching file bytes: {file_path}")
    
    try:
        # Get signed URL
        response = supabase.storage.from_(BUCKET_NAME).create_signed_url(
            file_path,
            3600  # 1 hour expiry
        )
        
        if 'signedURL' not in response:
            raise Exception(f"Failed to get signed URL: {response}")
        
        signed_url = response['signedURL']
        
        # Fetch file content directly into memory
        file_response = requests.get(signed_url, timeout=30)
        file_response.raise_for_status()
        
        file_bytes = file_response.content
        
        print(f"✅ Fetched: {len(file_bytes)} bytes (in memory)")
        return file_bytes
        
    except Exception as e:
        print(f"❌ Error fetching file: {e}")
        raise


# ============================================
# PROFILE LOOKUPS
# ============================================

def get_profile_info(profile_id: str) -> dict:
    """
    Get profile info using profile_id.

    Preferred source: profiles table  (display_name / name columns).
    Fallback source:  personal table  (profile_id foreign key).

    Returns a dict with at least a 'display_name' key on success,
    or None if the profile cannot be found in either table.
    """
    if not profile_id:
        return None

    # Preferred source: profiles table (profile-scoped display_name)
    try:
        profile_result = (
            supabase
            .table('profiles')
            .select('id, user_id, auth_id, name, display_name')
            .eq('id', profile_id)
            .limit(1)
            .execute()
        )

        if profile_result.data:
            profile = profile_result.data[0]
            display_name = (
                (profile.get('display_name') or '').strip()
                or (profile.get('name') or '').strip()
            )
            if display_name:
                profile['display_name'] = display_name
                print(f"✅ Profile found (profiles table): {display_name}")
                return profile

    except Exception as e:
        print(f"⚠️ Get profile info: profiles lookup failed: {e}")

    # Fallback source: personal table by profile_id
    try:
        personal_result = (
            supabase
            .table('personal')
            .select('*')
            .eq('profile_id', profile_id)
            .limit(1)
            .execute()
        )

        if personal_result.data:
            row = personal_result.data[0]
            print(f"✅ Profile found (personal table): {row.get('display_name')}")
            return row

    except Exception as e:
        print(f"⚠️ Get profile info: personal.profile_id lookup failed: {e}")

    print(f"ℹ️  No profile found for id: {profile_id}")
    return None


# ============================================
# DATABASE OPERATIONS - FIXED VERSION
# ============================================

def save_extracted_data(profile_id: str, file_path: str, file_name: str, 
                       folder_type: str, extracted_text: str, 
                       patient_name: str = None, report_date: str = None,
                       age: str = None, gender: str = None, 
                       report_type: str = None, doctor_name: str = None,
                       hospital_name: str = None,
                       name_match_status: str = 'pending',
                       name_match_confidence: float = None):
    """
    Save extracted text and metadata to database.
    FIXED: Removed undefined structured_data_json reference.

    NOTE: profile_id is the owner ID used for storage/report isolation.
    Legacy compatibility: user_id (TEXT) is still populated with profile_id.
    """
    print(f"\n💾 Saving to database: {file_name}")
    
    try:
        profile_id_str = str(profile_id)

        data = {
            'user_id': profile_id_str,  # legacy compatibility
            'profile_id': profile_id_str,
            'file_path': file_path,
            'file_name': file_name,
            'folder_type': folder_type,
            'extracted_text': extracted_text,
            'patient_name': patient_name,
            'report_date': report_date,
            'age': age,
            'gender': gender,
            'report_type': report_type,
            'doctor_name': doctor_name,
            'hospital_name': hospital_name,
            'name_match_status': name_match_status,
            'name_match_confidence': name_match_confidence,
            'processing_status': 'completed'
        }
        
        # Use profile-scoped conflict target first; fallback for legacy schemas.
        try:
            result = supabase.table('medical_reports_processed').upsert(
                data,
                on_conflict='profile_id,file_path'
            ).execute()
        except Exception:
            result = supabase.table('medical_reports_processed').upsert(
                data,
                on_conflict='user_id,file_path'
            ).execute()
        
        record_id = result.data[0]['id'] if result.data else None
        print(f"✅ Saved (ID: {record_id})")
        print(f"   Patient: {patient_name or 'Unknown'} ({age or 'N/A'}, {gender or 'N/A'})")
        print(f"   Date: {report_date or 'Unknown'}")
        print(f"   Type: {report_type or 'Unknown'}")
        print(f"   Doctor: {doctor_name or 'Unknown'}")
        print(f"   Hospital: {hospital_name or 'Unknown'}")
        print(f"   Name Match: {name_match_status} ({name_match_confidence or 'N/A'})")
        print(f"   Text length: {len(extracted_text)} characters")
        
        return record_id
        
    except Exception as e:
        print(f"❌ Error saving to database: {e}")
        import traceback
        traceback.print_exc()
        raise


def get_processed_reports(profile_id: str, folder_type: str = None):
    """
    Get all processed reports for a profile from database.
    Strictly scoped to profile_id.
    """
    print(f"\n📊 Fetching processed reports for profile: {profile_id}")
    
    try:
        profile_id_str = str(profile_id)
        query = (
            supabase
            .table('medical_reports_processed')
            .select('*')
            .eq('profile_id', profile_id_str)
            .eq('processing_status', 'completed')
        )

        if folder_type:
            print(f"   Filtering by folder: {folder_type}")
            query = query.eq('folder_type', folder_type)
        
        result = query.execute()
        rows = result.data or []

        print(f"✅ Retrieved {len(rows)} reports")
        for r in rows:
            print(f"   • {r.get('file_name')} ({r.get('folder_type')}) - {r.get('report_date') or 'No date'}")
        
        return rows
        
    except Exception as e:
        print(f"❌ Error fetching processed reports: {e}")
        return []


def delete_orphaned_report_records(profile_id: str, folder_type: str = None):
    """
    Delete all processed report records for a profile/folder that no longer
    have a corresponding file in storage (bulk delete by profile scope).

    Used when storage shows zero files — cleans up the entire DB scope.
    Returns the number of deleted records.
    """
    print(f"\n🗑️  Deleting orphaned records for profile: {profile_id}")

    try:
        profile_id_str = str(profile_id)
        query = (
            supabase
            .table('medical_reports_processed')
            .delete()
            .eq('profile_id', profile_id_str)
        )
        if folder_type:
            query = query.eq('folder_type', folder_type)

        result = query.execute()
        deleted = len(result.data) if result.data else 0

        print(f"✅ Deleted {deleted} orphaned record(s)")
        return deleted

    except Exception as e:
        print(f"❌ Error deleting orphaned records: {e}")
        raise


def delete_report_record_by_id(record_id: str):
    """
    Delete a single processed report record by its primary-key ID.

    Used during incremental orphan cleanup when iterating over stale records
    that no longer match a file in storage.
    """
    print(f"🗑️  Deleting report record: {record_id}")

    try:
        supabase.table('medical_reports_processed').delete().eq('id', record_id).execute()
        print(f"✅ Deleted record: {record_id}")

    except Exception as e:
        print(f"❌ Error deleting record {record_id}: {e}")
        raise


def compute_signature_from_reports(reports: list) -> str:
    """Compute a stable signature for a list of processed reports."""
    try:
        items = []
        for r in reports:
            fp = r.get('file_path') or r.get('file_name') or ''
            text_len = len(r.get('extracted_text') or '')
            processed_at = r.get('processed_at') or ''
            items.append(f"{fp}|{text_len}|{processed_at}")

        items.sort()
        concat = ";;".join(items)
        sig = hashlib.sha256(concat.encode('utf-8')).hexdigest()
        
        print(f"🔐 Computed signature: {sig[:16]}...")
        return sig
        
    except Exception as e:
        print(f"⚠️  Failed to compute signature: {e}")
        return ''


def save_summary_cache(profile_id: str, folder_type: str, summary: str, 
                      report_count: int, reports_signature: str = None):
    """
    Cache generated summary with signature.

    NOTE: profile_id is the owner key. user_id is populated with profile_id
    for legacy compatibility with existing unique constraints.
    """
    print(f"\n💾 Caching summary for profile: {profile_id}")
    
    try:
        profile_id_str = str(profile_id)
        payload = {
            'user_id': profile_id_str,  # legacy compatibility
            'profile_id': profile_id_str,
            'folder_type': folder_type,
            'summary_text': summary,
            'report_count': report_count,
            'reports_signature': reports_signature
        }

        # Use profile-scoped conflict target first; fallback for legacy schemas.
        try:
            result = supabase.table('medical_summaries_cache').upsert(
                payload,
                on_conflict='profile_id,folder_type'
            ).execute()
        except Exception:
            result = supabase.table('medical_summaries_cache').upsert(
                payload,
                on_conflict='user_id,folder_type'
            ).execute()
        
        print(f"✅ Summary cached")
        print(f"   Reports: {report_count}")
        print(f"   Folder: {folder_type}")
        print(f"   Signature: {reports_signature[:16] if reports_signature else 'None'}...")
        
        return True
        
    except Exception as e:
        print(f"❌ Error caching summary: {e}")
        return False


def get_cached_summary(profile_id: str, folder_type: str = None, expected_signature: str = None):
    """
    Get cached summary if it exists and its signature is still valid.
    Strictly scoped to profile_id.
    """
    print(f"\n🔍 Checking for cached summary...")
    
    try:
        profile_id_str = str(profile_id)
        query = supabase.table('medical_summaries_cache').select('*').eq(
            'profile_id', profile_id_str
        )
        if folder_type:
            query = query.eq('folder_type', folder_type)

        result = query.order('generated_at', desc=True).limit(1).execute()
        rows = result.data or []

        if rows:
            record = rows[0]
            stored_sig = record.get('reports_signature') or ''
            
            # Check signature match
            if expected_signature:
                if stored_sig != expected_signature:
                    print("⚠️  Cache signature mismatch - reports changed")
                    print(f"   Expected: {expected_signature[:16]}...")
                    print(f"   Stored:   {stored_sig[:16]}...")
                    return None
            
            print(f"✅ Found valid cached summary")
            print(f"   Generated: {record.get('generated_at')}")
            print(f"   Reports: {record.get('report_count')}")
            print(f"   Folder: {record.get('folder_type')}")
            
            return record

        print(f"ℹ️  No cached summary found")
        return None
        
    except Exception as e:
        print(f"❌ Error fetching cached summary: {e}")
        return None


def clear_user_cache(profile_id: str, folder_type: str = None):
    """
    Clear cached summaries for a profile.
    Strictly scoped to profile_id.
    """
    print(f"\n🗑️  Clearing cache for profile: {profile_id}")
    
    try:
        profile_id_str = str(profile_id)
        query = supabase.table('medical_summaries_cache').delete().eq(
            'profile_id', profile_id_str
        )
        if folder_type:
            query = query.eq('folder_type', folder_type)
        result = query.execute()
        deleted = len(result.data) if result.data else 0
        
        print(f"✅ Cleared {deleted} cached summary(s)")
        return deleted
        
    except Exception as e:
        print(f"❌ Error clearing cache: {e}")
        raise


def clear_user_data(profile_id: str):
    """
    Clear all processed data for a profile.
    Strictly scoped to profile_id.
    """
    print(f"\n🗑️  Clearing ALL data for profile: {profile_id}")
    
    try:
        profile_id_str = str(profile_id)
        result1 = (
            supabase
            .table('medical_reports_processed')
            .delete()
            .eq('profile_id', profile_id_str)
            .execute()
        )
        result2 = (
            supabase
            .table('medical_summaries_cache')
            .delete()
            .eq('profile_id', profile_id_str)
            .execute()
        )
        deleted_count = len(result1.data) if result1.data else 0
        cache_count = len(result2.data) if result2.data else 0
        
        print(f"✅ Cleared {deleted_count} reports and {cache_count} cached summaries")
        return deleted_count
        
    except Exception as e:
        print(f"❌ Error clearing user data: {e}")
        raise


# ============================================
# HEALTH CHECK
# ============================================

def test_connection():
    """Test Supabase connection."""
    print("\n🧪 Testing Supabase connection...")
    
    try:
        # Test database
        supabase.table('medical_reports_processed').select('id').limit(1).execute()
        
        # Test storage
        buckets = supabase.storage.list_buckets()
        
        print("✅ Supabase connection successful")
        print(f"   Database access: ✓")
        print(f"   Storage access: ✓")
        print(f"   Buckets found: {len(buckets)}")
        
        return True
        
    except Exception as e:
        print(f"❌ Supabase connection failed: {e}")
        return False


if __name__ == "__main__":
    print("\n" + "="*60)
    test_connection()
    print("="*60)