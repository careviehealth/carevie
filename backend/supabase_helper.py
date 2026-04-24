import os
from supabase import create_client, Client
from dotenv import load_dotenv
import requests
import hashlib
import io
import uuid

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise ValueError("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
print(f"✅ Supabase client initialized: {SUPABASE_URL}")

BUCKET_NAME = "medical-vault"


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
        
        files = [f for f in response if f.get('metadata')]
        
        print(f"✅ Found {len(files)} files")
        for f in files:
            print(f"   • {f.get('name')}")
        
        return files
        
    except Exception as e:
        print(f"❌ Error listing files: {e}")
        return []


def get_file_bytes(file_path: str) -> bytes:
    """
    Fetch file content as bytes directly from storage, bypassing local disk writing.
    """
    print(f"📥 Fetching file bytes: {file_path}")
    
    try:
        response = supabase.storage.from_(BUCKET_NAME).create_signed_url(
            file_path,
            3600
        )
        
        if 'signedURL' not in response:
            raise Exception(f"Failed to get signed URL: {response}")
        
        signed_url = response['signedURL']
        
        file_response = requests.get(signed_url, timeout=30)
        file_response.raise_for_status()
        
        file_bytes = file_response.content
        
        print(f"✅ Fetched: {len(file_bytes)} bytes (in memory)")
        return file_bytes
        
    except Exception as e:
        print(f"❌ Error fetching file: {e}")
        raise


def get_profile_info(profile_id: str) -> dict:
    """
    Retrieve profile info.
    Prefers the 'profiles' table for display_name, falling back to the 'personal' table.
    """
    if not profile_id:
        return None

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


def save_extracted_data(profile_id: str, file_path: str, file_name: str, 
                       folder_type: str, extracted_text: str, 
                       patient_name: str = None, report_date: str = None,
                       age: str = None, gender: str = None, 
                       report_type: str = None, doctor_name: str = None,
                       hospital_name: str = None,
                       name_match_status: str = 'pending',
                       name_match_confidence: float = None):
    """
    Save extracted metadata.
    Maintains legacy schema compatibility by populating 'user_id' with 'profile_id'.
    """
    print(f"\n💾 Saving to database: {file_name}")
    
    try:
        profile_id_str = str(profile_id)

        data = {
            'user_id': profile_id_str,
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
    """Retrieve strictly profile-scoped processed reports."""
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
    """Bulk cleanup for DB records that lack corresponding storage files."""
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
    print(f"🗑️  Deleting report record: {record_id}")

    try:
        supabase.table('medical_reports_processed').delete().eq('id', record_id).execute()
        print(f"✅ Deleted record: {record_id}")

    except Exception as e:
        print(f"❌ Error deleting record {record_id}: {e}")
        raise


def delete_report_records_bulk(record_ids: list) -> int:
    if not record_ids:
        return 0

    print(f"🗑️  Bulk deleting {len(record_ids)} report records...")
    try:
        result = supabase.table('medical_reports_processed').delete().in_('id', record_ids).execute()
        deleted = len(result.data) if result.data else 0
        print(f"✅ Bulk deleted {deleted} records")
        return deleted
    except Exception as e:
        print(f"❌ Error bulk deleting records: {e}")
        raise


def compute_signature_from_reports(reports: list) -> str:
    """Compute a stable hash signature for cache validation."""
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


def compute_signature_from_docs(docs: list) -> str:
    """
    Compute a stable hash signature for storage-doc metadata.

    Expected doc shape supports keys like:
      - file_path
      - file_name
      - source_file_hash
    """
    try:
        items = []
        for d in docs:
            file_path = d.get("file_path") or d.get("path") or ""
            file_name = d.get("file_name") or d.get("name") or ""
            source_hash = d.get("source_file_hash") or ""
            items.append(f"{file_path}|{file_name}|{source_hash}")

        items.sort()
        concat = ";;".join(items)
        sig = hashlib.sha256(concat.encode("utf-8")).hexdigest()
        print(f"🔐 Computed docs signature: {sig[:16]}...")
        return sig
    except Exception as e:
        print(f"⚠️  Failed to compute docs signature: {e}")
        return ""


def save_summary_cache(profile_id: str, folder_type: str, summary: str, 
                      report_count: int, reports_signature: str = None):
    """
    Cache generated summary.
    Uses delete-then-insert to avoid reliance on unique constraints.
    Maintains legacy schema compatibility by populating 'user_id' with 'profile_id'.
    """
    print(f"\n💾 Caching summary for profile: {profile_id}")
    
    try:
        profile_id_str = str(profile_id)

        # Delete existing row(s) for this profile+folder_type first
        # (table has no unique index on these columns, so upsert is unreliable)
        try:
            supabase.table('medical_summaries_cache').delete().eq(
                'profile_id', profile_id_str
            ).eq('folder_type', folder_type).execute()
        except Exception:
            pass

        payload = {
            'user_id': profile_id_str,
            'profile_id': profile_id_str,
            'folder_type': folder_type,
            'summary_text': summary,
            'report_count': report_count,
            'reports_signature': reports_signature
        }

        supabase.table('medical_summaries_cache').insert(payload).execute()
        
        print(f"✅ Summary cached")
        print(f"   Reports: {report_count}")
        print(f"   Folder: {folder_type}")
        print(f"   Signature: {reports_signature[:16] if reports_signature else 'None'}...")
        
        return True
        
    except Exception as e:
        print(f"❌ Error caching summary: {e}")
        return False


def get_cached_summary(profile_id: str, folder_type: str = None, expected_signature: str = None):
    """Retrieve cached summary if the content signature matches."""
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


def _insurance_cache_user_id_candidates(profile_id: str) -> list[str]:
    """
    Return candidate auth user UUIDs for insurance_summary_cache.user_id.
    Sources (in priority order):
      1) existing insurance_summary_cache row for this profile
      2) profiles.auth_id
      3) profiles.user_id
      4) profiles.id
      5) profile_id itself (guaranteed fallback — always a valid UUID)
    """
    candidates: list[str] = []
 
    def _push_uuid(raw):
        if not raw:
            return
        try:
            val = str(uuid.UUID(str(raw)))
            if val not in candidates:
                candidates.append(val)
        except Exception:
            pass
 
    try:
        existing = (
            supabase
            .table("insurance_summary_cache")
            .select("user_id")
            .eq("profile_id", str(profile_id))
            .limit(1)
            .execute()
        )
        rows = existing.data or []
        if rows:
            _push_uuid(rows[0].get("user_id"))
    except Exception:
        pass
 
    try:
        result = (
            supabase
            .table("profiles")
            .select("id, auth_id, user_id")
            .eq("id", str(profile_id))
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if rows:
            row = rows[0]
            _push_uuid(row.get("auth_id"))
            _push_uuid(row.get("user_id"))
            _push_uuid(row.get("id"))
    except Exception as e:
        print(f"⚠️ _insurance_cache_user_id_candidates failed: {e}")
 
    # Guaranteed fallback: profile_id is always a valid UUID in Supabase deployments.
    # This ensures the INSERT can always proceed even when auth_id / user_id columns
    # are unpopulated in the profiles table.
    _push_uuid(str(profile_id))
 
    return candidates


def get_cached_insurance_summary(profile_id: str, expected_signature: str = None):
    """Retrieve latest insurance summary cache row, optionally signature-validated."""
    print(f"\n🔍 Checking for cached insurance summary...")
    try:
        result = (
            supabase
            .table("insurance_summary_cache")
            .select("*")
            .eq("profile_id", str(profile_id))
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            print("ℹ️  No cached insurance summary found")
            return None

        record = rows[0]
        stored_sig = record.get("reports_signature") or ""
        if expected_signature and stored_sig != expected_signature:
            print("⚠️  Insurance cache signature mismatch - documents changed")
            print(f"   Expected: {expected_signature[:16]}...")
            print(f"   Stored:   {stored_sig[:16]}...")
            return None

        print("✅ Found valid cached insurance summary")
        print(f"   Created: {record.get('created_at')}")
        print(f"   Reports: {record.get('report_count')}")
        return record
    except Exception as e:
        print(f"❌ Error fetching insurance cache: {e}")
        return None


def save_insurance_summary_cache(
    profile_id: str,
    summary: str,
    report_count: int,
    reports_signature: str = None,
    report_type: str = "insurance",
):
    """
    Persist insurance summary cache.
    Table requires user_id (auth user UUID), so we resolve it from profiles.
    """
    print(f"\n💾 Caching insurance summary for profile: {profile_id}")
    profile_id_str = str(profile_id)
    errors: list[str] = []
 
    candidates = _insurance_cache_user_id_candidates(profile_id_str)
    if not candidates:
        print(
            "⚠️  Could not resolve candidate auth UUID(s) for insurance cache; "
            "skipping DB write."
        )
        return False
 
    # Keep one latest row per profile for deterministic retrieval.
    try:
        supabase.table("insurance_summary_cache").delete().eq(
            "profile_id", profile_id_str
        ).execute()
    except Exception:
        pass
 
    for user_id in candidates:
        try:
            payload = {
                "user_id": user_id,
                "profile_id": profile_id_str,
                "summary_text": summary,
                "report_count": int(report_count or 0),
                "reports_signature": reports_signature,
                "folder_type": report_type,
            }
            supabase.table("insurance_summary_cache").insert(payload).execute()
 
            print("✅ Insurance summary cached")
            print(f"   User ID: {user_id}")
            print(f"   Reports: {report_count}")
            print(f"   Type: {report_type}")
            print(f"   Signature: {reports_signature[:16] if reports_signature else 'None'}...")
            return True
        except Exception as e:
            errors.append(f"{user_id}: {e}")
            continue
 
    print("❌ Error caching insurance summary: all user_id candidates failed")
    for err in errors[:3]:
        print(f"   - {err}")
    return False


def clear_insurance_cache(profile_id: str):
    """Clear insurance summary cache rows for a profile."""
    print(f"\n🗑️  Clearing insurance cache for profile: {profile_id}")
    try:
        result = (
            supabase
            .table("insurance_summary_cache")
            .delete()
            .eq("profile_id", str(profile_id))
            .execute()
        )
        deleted = len(result.data) if result.data else 0
        print(f"✅ Cleared {deleted} insurance cached summary(s)")
        return deleted
    except Exception as e:
        print(f"❌ Error clearing insurance cache: {e}")
        raise


def clear_user_data(profile_id: str):
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


def test_connection():
    print("\n🧪 Testing Supabase connection...")
    
    try:
        supabase.table('medical_reports_processed').select('id').limit(1).execute()
        buckets = supabase.storage.list_buckets()
        
        print("✅ Supabase connection successful")
        print(f"   Database access: ✓")
        print(f"   Storage access: ✓")
        print(f"   Buckets found: {len(buckets)}")
        
        return True
        
    except Exception as e:
        print(f"❌ Supabase connection failed: {e}")
        return False


def get_medications(profile_id: str) -> list:
    """Return the medications JSONB array for a profile, or an empty list."""
    try:
        result = (
            supabase
            .table("user_medications")
            .select("medications")
            .eq("profile_id", str(profile_id))
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0].get("medications") or [] if rows else []
    except Exception as e:
        print(f"❌ get_medications failed for profile {profile_id}: {e}")
        return []
 
 
def get_medication_logs(profile_id: str) -> list:
    """Return the logs JSONB array from user_medication_logs for a profile."""
    try:
        result = (
            supabase
            .table("user_medication_logs")
            .select("logs")
            .eq("profile_id", str(profile_id))
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0].get("logs") or [] if rows else []
    except Exception as e:
        print(f"❌ get_medication_logs failed for profile {profile_id}: {e}")
        return []
 
 
def get_medical_team(profile_id: str) -> list:
    """Return the doctors JSONB array from user_medical_team for a profile."""
    try:
        result = (
            supabase
            .table("user_medical_team")
            .select("doctors")
            .eq("profile_id", str(profile_id))
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0].get("doctors") or [] if rows else []
    except Exception as e:
        print(f"❌ get_medical_team failed for profile {profile_id}: {e}")
        return []
 
 
def get_health_medication_data(profile_id: str) -> dict:
    """
    Return medication-relevant fields from the health table for a profile.
    Selected columns: allergies, current_medication, ongoing_treatments,
    long_term_treatments, current_diagnosed_condition.
    """
    try:
        result = (
            supabase
            .table("health")
            .select(
                "allergies,"
                "current_medication,"
                "ongoing_treatments,"
                "long_term_treatments,"
                "current_diagnosed_condition"
            )
            .eq("profile_id", str(profile_id))
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else {}
    except Exception as e:
        print(f"❌ get_health_medication_data failed for profile {profile_id}: {e}")
        return {}

def get_appointments(profile_id: str) -> list:
    """Return the appointments JSONB array for a profile, or an empty list."""
    try:
        result = (
            supabase
            .table("user_appointments")
            .select("appointments")
            .eq("profile_id", str(profile_id))
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0].get("appointments") or [] if rows else []
    except Exception as e:
        print(f"❌ get_appointments failed for profile {profile_id}: {e}")
        return []
    
def get_user_card_data(profile_id: str) -> dict:
    """
    Fetch and merge user card fields from the profiles and health tables.

    profiles  → name, gender, phone
    health    → date_of_birth, blood_group, age
    """
    card: dict = {}
    profile_id_str = str(profile_id)

    try:
        result = (
            supabase
            .table("profiles")
            .select("name, gender, phone, address")
            .eq("id", profile_id_str)
            .limit(1)
            .execute()
        )
        if result.data:
            card.update(result.data[0])
    except Exception as e:
        print(f"❌ get_user_card_data: profiles lookup failed for {profile_id}: {e}")

    try:
        result = (
            supabase
            .table("health")
            .select("date_of_birth, blood_group, bmi, age")
            .eq("profile_id", profile_id_str)
            .limit(1)
            .execute()
        )
        if result.data:
            card.update(result.data[0])
    except Exception as e:
        print(f"❌ get_user_card_data: health lookup failed for {profile_id}: {e}")

    return card

def get_document_urls(profile_id: str) -> dict:
    """
    Fetch signed URLs valid for 1 week (604800 seconds) for
    reports, prescriptions, and insurance documents directly from Storage.
    Sorts the files so the latest documents appear on top.
    """
    documents = {
        "reports": [],
        "prescriptions": [],
        "insurance": []
    }
    
    # 1 week = 7 days * 24 hours * 60 minutes * 60 seconds
    EXPIRY_SECONDS = 604800 

    for folder in documents.keys():
        folder_path = f"{profile_id}/{folder}"
        
        try:
            # List files directly from the storage bucket
            files = supabase.storage.from_(BUCKET_NAME).list(folder_path)
            
            # Filter out empty metadata (like placeholder folder objects)
            valid_files = [f for f in files if f.get('metadata')]
            
            # Sort files by created_at descending (latest first)
            valid_files.sort(key=lambda x: x.get('created_at', ''), reverse=True)
            
            for f in valid_files:
                file_name = f.get('name')
                file_path = f"{folder_path}/{file_name}"
                created_at_full = f.get('created_at', '')
                created_at = created_at_full[:10] if created_at_full else 'Unknown Date'
                
                try:
                    response = supabase.storage.from_(BUCKET_NAME).create_signed_url(
                        file_path,
                        EXPIRY_SECONDS
                    )
                    
                    # Handle potential supabase-py response formats
                    url = response.get('signedURL') if isinstance(response, dict) else response
                    import urllib.parse
                    encoded_name = urllib.parse.quote(file_name)
                    if '?' in url:
                        url += f"&download={encoded_name}"
                    else:
                        url += f"?download={encoded_name}"
                    documents[folder].append({
                        "file_name": file_name,
                        "date": created_at,
                        "url": url
                    })
                except Exception as e:
                    print(f"⚠️ Could not generate URL for {file_name}: {e}")
                    
        except Exception:
            # Normal behavior if the folder doesn't exist yet for the user
            pass

    return documents

def get_full_patient_data(profile_id: str) -> dict:
    """
    Fetch all clinically relevant data for a profile in a single call.

    Returns a structured dict with the following top-level keys:
        demographics        – name, age, DOB, gender, blood group, height, weight, phone
        emergency_card      – critical allergies, chronic conditions, preferred hospital, insurance
        emergency_contacts  – list from user_emergency_contacts.contacts
        health              – allergies, conditions (current/previous/childhood), treatments,
                              surgeries, family history
        medical_team        – list from user_medical_team.doctors
        appointments        – list from user_appointments.appointments
        medications         – list from user_medications.medications

    All raw DB/technical fields (id, user_id, profile_id, created_at, updated_at, etc.)
    are stripped before returning.
    """
    pid = str(profile_id)

    # ── internal strip helper ──────────────────────────────────────────────
    _STRIP_KEYS = {
        "id", "user_id", "profile_id", "auth_id",
        "created_at", "updated_at", "processed_at",
        "structured_extracted_at", "generated_at",
    }

    def _clean(obj):
        """Recursively remove technical keys from dicts / lists."""
        if isinstance(obj, dict):
            return {k: _clean(v) for k, v in obj.items() if k not in _STRIP_KEYS}
        if isinstance(obj, list):
            return [_clean(i) for i in obj]
        return obj

    def _first(table, select, filter_col="profile_id"):
        try:
            r = supabase.table(table).select(select).eq(filter_col, pid).limit(1).execute()
            return _clean(r.data[0]) if r.data else {}
        except Exception as e:
            print(f"⚠️  get_full_patient_data: [{table}] fetch failed – {e}")
            return {}

    def _jsonb_list(table, column, filter_col="profile_id"):
        try:
            r = supabase.table(table).select(column).eq(filter_col, pid).limit(1).execute()
            return _clean((r.data[0].get(column) or []) if r.data else [])
        except Exception as e:
            print(f"⚠️  get_full_patient_data: [{table}.{column}] fetch failed – {e}")
            return []

    # ── 1. Demographics (profiles + health merged) ─────────────────────────
    profile_row = _first(
        "profiles",
        "name, display_name, gender, phone",
        filter_col="id",
    )
    health_demo = _first(
        "health",
        "age, blood_group, "
        "height_cm, height_ft, weight_kg, weight_lbs",
    )
    demographics = {**profile_row, **health_demo}

    # ── 2. Emergency card ──────────────────────────────────────────────────
    emergency_card = _first(
        "care_emergency_cards",
        "name, age, blood_group, critical_allergies, chronic_conditions, "
        "current_meds, emergency_instructions, emergency_contact_name, "
        "emergency_contact_phone, preferred_hospital, "
        "insurer_name, plan_type, tpa_helpline",
    )

    # ── 3. Emergency contacts ──────────────────────────────────────────────
    emergency_contacts = _jsonb_list("user_emergency_contacts", "contacts")

    # ── 4. Full health history ─────────────────────────────────────────────
    health = _first(
        "health",
        "allergies, current_diagnosed_condition, previous_diagnosed_conditions, "
        "ongoing_treatments, past_surgeries, "
        "childhood_illness, long_term_treatments, family_history",
    )

    # ── 5. Medical team ────────────────────────────────────────────────────
    medical_team = _jsonb_list("user_medical_team", "doctors")

    # ── 6. Appointments ────────────────────────────────────────────────────
    appointments = _jsonb_list("user_appointments", "appointments")

    # ── 7. Medications ─────────────────────────────────────────────────────
    medications = _jsonb_list("user_medications", "medications")

# ── 8. Documents (Signed URLs from Storage) ────────────────────────────
    documents = get_document_urls(pid)
    medical_summary = None
    try:
        ms_res = (
            supabase.table("medical_summaries_cache")
            .select("summary_text, folder_type, generated_at, reports_signature")
            .eq("profile_id", pid)
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
        )
        if ms_res.data:
            medical_summary = ms_res.data[0]
    except Exception:
        pass

    insurance_summary = None
    try:
        ins_res = (
            supabase.table("insurance_summary_cache")
            .select("summary_text, created_at, reports_signature")
            .eq("profile_id", pid)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if ins_res.data:
            insurance_summary = ins_res.data[0]
    except Exception:
        pass

    return {
        "demographics":      demographics,
        "emergency_card":    emergency_card,
        "emergency_contacts": emergency_contacts,
        "health":            health,
        "medical_team":      medical_team,
        "appointments":      appointments,
        "medications":       medications,
        "documents":         documents,
        "medical_summary":   medical_summary,
        "insurance_summary": insurance_summary,
    }

def get_emergency_contacts(profile_id: str) -> list:
    """Fetch the contacts JSONB array from user_emergency_contacts for a profile."""
    try:
        result = (
            supabase
            .table("user_emergency_contacts")
            .select("contacts")
            .eq("profile_id", str(profile_id))
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0].get("contacts") or [] if rows else []
    except Exception as e:
        print(f"❌ get_emergency_contacts failed for profile {profile_id}: {e}")
        return []


def get_full_health_record(profile_id: str) -> dict:
    """
    Fetch ALL health fields for a profile.

    Returns a dict with both current and past medical fields so the caller
    can split them into separate sections without a second query.
    """
    try:
        result = (
            supabase
            .table("health")
            .select(
                "allergies, current_diagnosed_condition, "
                "ongoing_treatments, current_medication, "
                "long_term_treatments, "
                "previous_diagnosed_conditions, childhood_illness, "
                "past_surgeries, family_history, "
                "height_cm, height_ft, weight_kg, weight_lbs"
            )
            .eq("profile_id", str(profile_id))
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else {}
    except Exception as e:
        print(f"❌ get_full_health_record failed for profile {profile_id}: {e}")
        return {}


if __name__ == "__main__":
    print("\n" + "="*60)
    test_connection()
    print("="*60)
