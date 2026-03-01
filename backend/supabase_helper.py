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

def list_user_files(user_id: str, folder_type: str = None):
    """List files from Supabase Storage for a user"""
    print(f"\n📂 Listing files for user: {user_id}")
    if folder_type:
        print(f"   Folder: {folder_type}")
    
    try:
        if folder_type:
            folder_path = f"{user_id}/{folder_type}"
        else:
            folder_path = f"{user_id}"
        
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
    Get file content as bytes directly from Supabase Storage
    NEVER downloads to disk
    
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


def get_file_as_bytesio(file_path: str) -> io.BytesIO:
    """
    Get file as BytesIO object for in-memory processing
    
    Args:
        file_path: Full path in storage
    
    Returns:
        BytesIO object containing file data
    """
    print(f"💾 Creating BytesIO for: {file_path}")
    
    try:
        # Get file bytes
        file_bytes = get_file_bytes(file_path)
        
        # Wrap in BytesIO
        bytes_io = io.BytesIO(file_bytes)
        
        print(f"✅ BytesIO created: {len(file_bytes)} bytes")
        return bytes_io
        
    except Exception as e:
        print(f"❌ Error creating BytesIO: {e}")
        raise


# ============================================
# DATABASE OPERATIONS - FIXED VERSION
# ============================================

def save_extracted_data(user_id: str, file_path: str, file_name: str, 
                       folder_type: str, extracted_text: str, 
                       patient_name: str = None, report_date: str = None,
                       age: str = None, gender: str = None, 
                       report_type: str = None, doctor_name: str = None,
                       hospital_name: str = None,
                       name_match_status: str = 'pending',
                       name_match_confidence: float = None):
    """
    Save extracted text and metadata to database
    FIXED: Removed undefined structured_data_json reference
    
    NOTE: user_id is TEXT in your schema, not UUID
    """
    print(f"\n💾 Saving to database: {file_name}")
    
    try:
        # Prepare data - simple dict without any undefined variables
        data = {
            'user_id': str(user_id),
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
        
        # Use upsert to handle duplicates
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


def get_processed_reports(user_id: str, folder_type: str = None):
    """
    Get all processed reports for a user from database
    
    NOTE: user_id is TEXT in your schema
    """
    print(f"\n📊 Fetching processed reports for user: {user_id}")
    
    try:
        query = supabase.table('medical_reports_processed').select('*').eq(
            'user_id', str(user_id)
        ).eq('processing_status', 'completed')
        
        if folder_type:
            query = query.eq('folder_type', folder_type)
            print(f"   Filtering by folder: {folder_type}")
        
        result = query.execute()
        
        print(f"✅ Retrieved {len(result.data)} reports")
        for r in result.data:
            print(f"   • {r.get('file_name')} ({r.get('folder_type')}) - {r.get('report_date') or 'No date'}")
        
        return result.data
        
    except Exception as e:
        print(f"❌ Error fetching processed reports: {e}")
        return []


def compute_signature_from_reports(reports: list) -> str:
    """Compute a stable signature for a list of processed reports"""
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


def get_user_profile(user_id: str) -> dict:
    """
    Get user profile from database
    
    Args:
        user_id: User ID (TEXT format)
    
    Returns:
        Profile dict or None if not found
    """
    print(f"\n👤 Fetching user profile: {user_id}")
    
    try:
        result = supabase.table('user_profiles').select('*').eq(
            'user_id', str(user_id)
        ).execute()
        
        if result.data and len(result.data) > 0:
            profile = result.data[0]
            print(f"✅ Profile found: {profile.get('full_name')}")
            return profile
        else:
            print(f"⚠️  No profile found for user: {user_id}")
            return None
            
    except Exception as e:
        print(f"❌ Error fetching profile: {e}")
        return None


def create_user_profile(user_id: str, full_name: str, **kwargs) -> dict:
    """
    Create user profile
    
    Args:
        user_id: User ID (TEXT format)
        full_name: User's full name
        **kwargs: Optional fields (email, phone, date_of_birth, gender)
    
    Returns:
        Created profile dict
    """
    print(f"\n✨ Creating user profile for: {user_id}")
    
    try:
        data = {
            'user_id': str(user_id),
            'full_name': full_name,
            'email': kwargs.get('email'),
            'phone': kwargs.get('phone'),
            'date_of_birth': kwargs.get('date_of_birth'),
            'gender': kwargs.get('gender')
        }
        
        result = supabase.table('user_profiles').insert(data).execute()
        
        if result.data and len(result.data) > 0:
            profile = result.data[0]
            print(f"✅ Profile created: {profile.get('full_name')}")
            return profile
        else:
            raise Exception("Profile creation returned no data")
            
    except Exception as e:
        print(f"❌ Error creating profile: {e}")
        raise


def update_user_profile(user_id: str, **updates) -> dict:
    """
    Update user profile
    
    Args:
        user_id: User ID (TEXT format)
        **updates: Fields to update
    
    Returns:
        Updated profile dict
    """
    print(f"\n🔄 Updating user profile: {user_id}")
    
    try:
        result = supabase.table('user_profiles').update(updates).eq(
            'user_id', str(user_id)
        ).execute()
        
        if result.data and len(result.data) > 0:
            profile = result.data[0]
            print(f"✅ Profile updated")
            return profile
        else:
            raise Exception("No profile found to update")
            
    except Exception as e:
        print(f"❌ Error updating profile: {e}")
        raise


def ensure_user_profile(user_id: str, default_name: str = None) -> dict:
    """
    Get profile or create if doesn't exist
    
    Args:
        user_id: User ID (TEXT format)
        default_name: Default name if creating new profile
    
    Returns:
        Profile dict
    """
    profile = get_user_profile(user_id)
    
    if profile:
        return profile
    
    # Create default profile if doesn't exist
    if default_name:
        print(f"⚠️  Creating default profile with name: {default_name}")
        return create_user_profile(user_id, default_name)
    else:
        return None


def save_summary_cache(user_id: str, folder_type: str, summary: str, 
                      report_count: int, reports_signature: str = None):
    """
    Cache generated summary with signature
    
    NOTE: user_id is TEXT in your schema
    """
    print(f"\n💾 Caching summary for user: {user_id}")
    
    try:
        payload = {
            'user_id': str(user_id),
            'folder_type': folder_type,
            'summary_text': summary,
            'report_count': report_count,
            'reports_signature': reports_signature
        }

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


def get_cached_summary(user_id: str, folder_type: str = None, expected_signature: str = None):
    """
    Get cached summary if exists and is valid
    
    NOTE: user_id is TEXT in your schema
    """
    print(f"\n🔍 Checking for cached summary...")
    
    try:
        query = supabase.table('medical_summaries_cache').select('*').eq(
            'user_id', str(user_id)
        )

        if folder_type:
            query = query.eq('folder_type', folder_type)

        result = query.order('generated_at', desc=True).limit(1).execute()

        if result.data:
            record = result.data[0]
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


def clear_user_cache(user_id: str, folder_type: str = None):
    """
    Clear cached summaries for a user
    
    NOTE: user_id is TEXT in your schema
    """
    print(f"\n🗑️  Clearing cache for user: {user_id}")
    
    try:
        query = supabase.table('medical_summaries_cache').delete().eq(
            'user_id', str(user_id)
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


def clear_user_data(user_id: str):
    """
    Clear all processed data for a user
    
    NOTE: user_id is TEXT in your schema
    """
    print(f"\n🗑️  Clearing ALL data for user: {user_id}")
    
    try:
        # Delete from processed reports
        result1 = supabase.table('medical_reports_processed').delete().eq(
            'user_id', str(user_id)
        ).execute()
        
        # Delete cached summaries
        result2 = supabase.table('medical_summaries_cache').delete().eq(
            'user_id', str(user_id)
        ).execute()
        
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
    """Test Supabase connection"""
    print("\n🧪 Testing Supabase connection...")
    
    try:
        # Test database
        result = supabase.table('medical_reports_processed').select('id').limit(1).execute()
        
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
    # Run this to test connection
    print("\n" + "="*60)
    test_connection()
    print("="*60)
