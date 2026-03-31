# backend/app_api.py

# Load environment variables FIRST before any imports that depend on them
from dotenv import load_dotenv
import os
import re
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

from flask import Flask, request, jsonify
from flask_cors import CORS
import traceback
import tempfile
import shutil
from datetime import datetime
import io

# Import RAG pipeline
from rag_pipeline.clean_chunk import clean_text, chunk_text, chunk_text_with_metadata
from rag_pipeline.embed_store import build_faiss_index
from rag_pipeline.rag_query import ask_rag_improved
from rag_pipeline.extract_metadata import extract_metadata_with_llm
from internal_auth import authorize_internal_request
import supabase_helper as sb

# ---------------------------------------------------------------------------
# OCR — import the superior standalone extractor instead of the old inline
# pytesseract-based extract_text_from_bytes that used to live in this file.
#
# extract_text_from_bytes(file_bytes, file_extension, ...) is a drop-in
# replacement: same signature, same return type (str), works entirely in
# memory (no disk I/O), and now uses the full PaddleOCR → EasyOCR pipeline
# with CLAHE preprocessing and multi-version API parsing.
# ---------------------------------------------------------------------------
from rag_pipeline.extractor_OCR import extract_text_from_bytes
from rag_pipeline.profile_checker import (
    verify_patient_name,
    filter_reports_by_name,
    INVALID_NAME_TOKENS,
)


app = Flask(__name__)

EXEMPT_INTERNAL_AUTH_PATHS = {"/api/health"}

# CORS configuration
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://vytara-official.vercel.app",
            "https://*.vercel.app",
            "https://sauncier-instigative-yolande.ngrok-free.dev",
            "https://vytara-ssr-qzin.onrender.com"
        ],
        "methods": ["GET", "POST", "DELETE", "PUT", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})


def log_step(step: str, status: str = "info", details: str = None):
    """Consistent logging"""
    symbols = {
        "start": "🔄",
        "success": "✅",
        "error": "❌",
        "warning": "⚠️",
        "info": "ℹ️"
    }
    symbol = symbols.get(status, "•")
    
    message = f"{symbol} {step}"
    if details:
        message += f": {details}"
    print(message, flush=True)


def internal_error_response(message: str, status_code: int = 500):
    return jsonify({
        "success": False,
        "error": message,
    }), status_code


@app.before_request
def require_internal_api_auth():
    if request.method == "OPTIONS":
        return None

    if not request.path.startswith("/api/"):
        return None

    if request.path in EXEMPT_INTERNAL_AUTH_PATHS:
        return None

    return authorize_internal_request()


# ---------------------------------------------------------------------------
# Name similarity / patient verification
# ---------------------------------------------------------------------------
# All name-matching logic lives in rag_pipeline/profile_checker.py.
# Imported above:  verify_patient_name, filter_reports_by_name, INVALID_NAME_TOKENS
# ---------------------------------------------------------------------------


# ============================================
# PROFILE LOOKUPS
# ============================================

def resolve_profile_id(data: dict) -> str:
    """Resolve profile ID from request payload."""
    if not data:
        return None

    raw_profile_id = data.get("profile_id")
    if raw_profile_id is None:
        return None

    profile_id = str(raw_profile_id).strip()
    return profile_id or None


# ============================================
# PROCESS FILES
# ============================================

@app.route("/api/process-files", methods=["POST"])
def process_files():
    """Process user files with name matching"""
    print("\n" + "="*80, flush=True)
    log_step("PROCESS FILES", "start")
    print("="*80, flush=True)
    
    try:
        data = request.get_json()
        
        profile_id = resolve_profile_id(data)
        if not profile_id:
            return jsonify({
                "success": False,
                "error": "profile_id is required"
            }), 400

        folder_type = data.get("folder_type", "reports")
        
        log_step("Config", "info", f"Profile: {profile_id}, Folder: {folder_type}")
        
        # Get profile info
        log_step("Fetching profile info", "start")
        user_info = sb.get_profile_info(profile_id)
        
        if not user_info:
            return jsonify({
                "success": False,
                "error": "Profile not found",
                "message": "Selected profile does not exist"
            }), 404

        if not user_info.get('display_name'):
            log_step("Profile info", "warning", "No display_name found")
            return jsonify({
                "success": False,
                "error": "Profile display name not found",
                "message": "Please set your display name in your profile first"
            }), 400
        
        user_display_name = user_info.get('display_name')
        log_step("Profile info", "success", f"User: {user_display_name}")
        
        # Get files from storage
        log_step("Fetching files", "start")
        files = sb.list_user_files(profile_id, folder_type)
        
        if not files:
            log_step("Files", "warning", "No files in storage")
            
            # Clean up orphaned records
            try:
                deleted = sb.delete_orphaned_report_records(profile_id, folder_type)
                log_step("Cleanup", "success", f"Deleted {deleted} orphaned records")
            except Exception as e:
                log_step("Cleanup", "error", str(e))
            
            return jsonify({
                "success": False,
                "error": "No files found for this profile"
            }), 404
        
        log_step("Files found", "success", f"{len(files)} files")
        
        # Get existing processed reports
        log_step("Checking processed", "start")
        existing_records = sb.get_processed_reports(profile_id, folder_type)
        
        # Build sets for comparison
        storage_paths = set(f"{profile_id}/{folder_type}/{f.get('name')}" for f in files)
        existing_paths = set(r['file_path'] for r in existing_records)
        
        # Delete orphaned records (files removed from storage but still in DB)
        orphaned = [r for r in existing_records if r['file_path'] not in storage_paths]
        deleted_count = 0
        
        if orphaned:
            log_step("Removing orphaned", "start")
            for record in orphaned:
                try:
                    sb.delete_report_record_by_id(record['id'])
                    log_step("Deleted", "success", record['file_name'])
                    deleted_count += 1
                except Exception as e:
                    log_step("Delete failed", "error", str(e))
        
        # Process new files
        log_step("Processing new files", "start")
        
        results = []
        successful = 0
        failed = 0
        skipped = 0
        matched_reports = 0
        mismatched_reports = 0
        
        for idx, file_info in enumerate(files, 1):
            file_name = file_info.get('name')
            file_path = f"{profile_id}/{folder_type}/{file_name}"
            
            print(f"\n{'─'*80}", flush=True)
            print(f"FILE {idx}/{len(files)}: {file_name}", flush=True)
            print(f"{'─'*80}", flush=True)
            
            # Skip if already processed
            if file_path in existing_paths:
                log_step("Status", "info", "Already processed (skipping)")
                results.append({
                    "file_name": file_name,
                    "status": "skipped",
                    "message": "Already processed"
                })
                skipped += 1
                continue
            
            log_step("Processing", "start", file_name)
            
            try:
                # Get file bytes
                log_step("Fetch", "start", "Loading from Supabase")
                file_bytes = sb.get_file_bytes(file_path)
                log_step("Fetched", "success", f"{len(file_bytes)} bytes")
                
                # Extract text using the superior PaddleOCR-based extractor
                file_ext = os.path.splitext(file_name)[1]
                log_step("OCR", "start")
                
                extracted_text = extract_text_from_bytes(file_bytes, file_ext)
                
                if not extracted_text or len(extracted_text.strip()) < 50:
                    raise Exception(f"Insufficient text extracted: {len(extracted_text.strip())} chars")
                
                log_step("Extracted", "success", f"{len(extracted_text)} chars")
                
                # Extract metadata
                log_step("Metadata", "start")
                metadata = extract_metadata_with_llm(extracted_text, file_name)
                
                report_patient_name = metadata.get('patient_name')
                age = metadata.get('age')
                gender = metadata.get('gender')
                report_date = metadata.get('report_date')
                report_type = metadata.get('report_type')
                doctor_name = metadata.get('doctor_name')
                hospital_name = metadata.get('hospital_name')
                
                log_step("Metadata", "success", 
                        f"Patient: {report_patient_name}, Age: {age}, Type: {report_type}")
                
                # ── Name verification ────────────────────────────────────────
                # Delegated entirely to profile_checker.verify_patient_name.
                # threshold=0.4 preserves the original partial-match behaviour:
                #   confidence ≥ 0.7  → strong match  (logged as success)
                #   confidence 0.4–0.7 → partial match (logged as warning, still 'matched')
                #   confidence < 0.4  → mismatched
                # ──────────────────────────────────────────────────────────────
                name_match_status = 'pending'
                name_match_confidence = 0.0

                # Regex fallback: if LLM metadata extraction did not yield a
                # usable name, attempt to pull it from the raw text.
                if not report_patient_name or str(report_patient_name).lower() in INVALID_NAME_TOKENS:
                    log_step("Name extraction", "warning", "Metadata extraction failed, trying text patterns...")

                    name_patterns = [
                        r"(?:MR\.|MRS\.|MS\.|DR\.)\s+([A-Z]+(?:\s+[A-Z]+)+)",
                        r"Patient\s*Name\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
                        r"Name\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
                    ]
                    for pattern in name_patterns:
                        m = re.search(pattern, extracted_text[:500], re.IGNORECASE)
                        if m:
                            report_patient_name = m.group(1).strip()
                            log_step("Name extraction", "success", f"Found from text: {report_patient_name}")
                            break

                # Core verification via profile_checker (false-positive bug fixed).
                verification = verify_patient_name(
                    report_name=report_patient_name,
                    profile_name=user_display_name,
                    threshold=0.4,
                )

                if verification['status'] in ('matched', 'mismatched'):
                    name_match_status    = verification['status']
                    name_match_confidence = verification['confidence']

                    if verification['confidence'] >= 0.7:
                        matched_reports += 1
                        log_step("Name verification", "success",
                                 f"MATCH: {verification['confidence']:.2f} - "
                                 f"'{report_patient_name}' vs '{user_display_name}'")
                    elif verification['status'] == 'matched':
                        # Partial match (0.4–0.7): include in summary with warning
                        matched_reports += 1
                        log_step("Name verification", "warning",
                                 f"PARTIAL MATCH: {verification['confidence']:.2f} - "
                                 f"'{report_patient_name}' vs '{user_display_name}' (including in summary)")
                    else:
                        mismatched_reports += 1
                        log_step("Name verification", "warning",
                                 f"MISMATCH: {verification['confidence']:.2f} - "
                                 f"Report '{report_patient_name}' vs User '{user_display_name}'")

                else:
                    # 'unknown': no usable patient name even after regex fallback.
                    # Last resort: check whether the user's name appears in the filename.
                    log_step("Name verification", "warning", "No patient name found in text")

                    file_name_lower  = file_name.lower()
                    user_name_parts  = user_display_name.lower().split()
                    name_in_filename = any(
                        part in file_name_lower for part in user_name_parts if len(part) > 2
                    )

                    if name_in_filename:
                        name_match_status    = 'matched'
                        name_match_confidence = 0.6
                        matched_reports += 1
                        log_step("Name verification", "success",
                                 f"FILENAME MATCH: User name '{user_display_name}' found in filename "
                                 f"(including in summary)")
                    else:
                        log_step("Name verification", "info",
                                 "Patient name unclear and not in filename - marked as pending")
                
                # Save to database
                log_step("Saving", "start")
                record_id = sb.save_extracted_data(
                    profile_id=profile_id,
                    file_path=file_path,
                    file_name=file_name,
                    folder_type=folder_type,
                    extracted_text=extracted_text,
                    patient_name=report_patient_name,
                    report_date=report_date,
                    age=age,
                    gender=gender,
                    report_type=report_type,
                    doctor_name=doctor_name,
                    hospital_name=hospital_name,
                    name_match_status=name_match_status,
                    name_match_confidence=name_match_confidence
                )
                
                log_step("Saved", "success", f"ID: {record_id}")
                
                results.append({
                    "file_name": file_name,
                    "status": "success",
                    "record_id": record_id,
                    "folder_type": folder_type,
                    "patient_name": report_patient_name,
                    "report_date": report_date,
                    "report_type": report_type,
                    "text_length": len(extracted_text),
                    "name_match_status": name_match_status,
                    "name_match_confidence": name_match_confidence
                })
                successful += 1
                
            except Exception as e:
                log_step("Failed", "error", f"{file_name}: {str(e)}")
                traceback.print_exc()
                
                results.append({
                    "file_name": file_name,
                    "status": "failed",
                    "error": "Processing failed"
                })
                failed += 1
        
        # Clear cache
        if deleted_count > 0 or successful > 0:
            log_step("Clearing cache", "start")
            try:
                cache_cleared = sb.clear_user_cache(profile_id)
                log_step("Cache cleared", "success", f"{cache_cleared} entries")
            except Exception as e:
                log_step("Cache clear failed", "error", str(e))
        
        # Summary
        print(f"\n{'='*80}", flush=True)
        log_step("COMPLETE", "success")
        print(f"{'='*80}", flush=True)
        print(f"  User: {user_display_name}", flush=True)
        print(f"  Total: {len(files)}", flush=True)
        print(f"  ✅ Processed: {successful}", flush=True)
        print(f"  ⏭️  Skipped: {skipped}", flush=True)
        print(f"  🗑️  Deleted: {deleted_count}", flush=True)
        print(f"  ❌ Failed: {failed}", flush=True)
        print(f"  ✅ Matched: {matched_reports}", flush=True)
        print(f"  ⚠️  Mismatched: {mismatched_reports}", flush=True)
        print(f"{'='*80}\n", flush=True)
        
        return jsonify({
            "success": True,
            "message": f"Processed {successful} files, skipped {skipped}",
            "profile_id": profile_id,
            "processed_count": successful,
            "skipped_count": skipped,
            "deleted_count": deleted_count,
            "failed_count": failed,
            "total_files": len(files),
            "matched_reports": matched_reports,
            "mismatched_reports": mismatched_reports,
            "results": results,
            "user_display_name": user_display_name
        }), 200
        
    except Exception as e:
        log_step("FATAL ERROR", "error", str(e))
        traceback.print_exc()

        return internal_error_response("Failed to process medical files")


# ============================================
# GENERATE SUMMARY (SMART FILTERING + WARNINGS)
# ============================================

@app.route("/api/generate-summary", methods=["POST"])
def generate_summary():
    """Generate summary for matched reports + show warnings for mismatched"""
    print("\n" + "="*80, flush=True)
    log_step("GENERATE SUMMARY (SMART FILTERING)", "start")
    print("="*80, flush=True)
    
    temp_dir = tempfile.mkdtemp(prefix="rag_")
    
    try:
        data = request.get_json()
        
        profile_id = resolve_profile_id(data)
        if not profile_id:
            return jsonify({
                "success": False,
                "error": "profile_id is required"
            }), 400

        use_cache = data.get("use_cache", True)
        force_regenerate = data.get("force_regenerate", False)
        folder_type = 'reports'
        
        log_step("Config", "info", f"Profile: {profile_id}, Folder: {folder_type}")
        log_step("Temp dir", "info", temp_dir)
        
        # Get profile info
        log_step("Fetching profile info", "start")
        user_info = sb.get_profile_info(profile_id)
        
        if not user_info:
            return jsonify({
                "success": False,
                "error": "Profile not found",
                "message": "Selected profile does not exist"
            }), 404

        if not user_info.get('display_name'):
            return jsonify({
                "success": False,
                "error": "Profile display name not found",
                "message": "Please set your display name in your profile first"
            }), 400
        
        user_display_name = user_info.get('display_name')
        log_step("Profile info", "success", f"User: {user_display_name}")
        
        # Get all processed reports
        log_step("Fetching reports", "start")
        all_reports = sb.get_processed_reports(profile_id, folder_type='reports')
        
        if not all_reports:
            log_step("Reports", "error", "No reports found")
            return jsonify({
                "success": False,
                "error": "No medical reports found",
                "message": "Please upload and process medical reports first"
            }), 404
        
        log_step("Reports found", "success", f"{len(all_reports)} total reports")
        
        # Separate matched vs mismatched
        matched_reports = []
        mismatched_reports = []
        pending_reports = []
        
        for report in all_reports:
            status = report.get('name_match_status', 'pending')
            
            if status == 'matched':
                matched_reports.append(report)
            elif status == 'mismatched':
                mismatched_reports.append(report)
            else:  # 'pending' or other
                pending_reports.append(report)
        
        log_step("Report analysis", "info", 
                f"Matched: {len(matched_reports)}, Mismatched: {len(mismatched_reports)}, Pending: {len(pending_reports)}")
        
        # Check if we have matched reports
        if len(matched_reports) == 0:
            log_step("Matched reports", "error", "No matched reports found")
            
            # Build helpful warning message
            warning_msg = f"## ⚠️ No Reports Found for '{user_display_name}'\n\n"
            
            if mismatched_reports:
                warning_msg += f"**Found {len(mismatched_reports)} report(s) for different patients:**\n\n"
                for r in mismatched_reports[:5]:
                    warning_msg += f"- **{r['file_name']}**: Patient name '{r.get('patient_name', 'Unknown')}'\n"
                warning_msg += "\n"
            
            if pending_reports:
                warning_msg += f"**Found {len(pending_reports)} report(s) with unclear patient names:**\n\n"
                for r in pending_reports[:5]:
                    warning_msg += f"- **{r['file_name']}**\n"
                warning_msg += "\n"
            
            warning_msg += "### 🔧 Possible Solutions:\n\n"
            warning_msg += "1. **Check your display name**: Make sure your profile display name matches the name in your reports\n"
            warning_msg += f"   - Current display name: **{user_display_name}**\n"
            warning_msg += "   - Report patient names: " + ", ".join([f"'{r.get('patient_name', 'Unknown')}'" for r in all_reports[:3]]) + "\n\n"
            warning_msg += "2. **Add OpenAI API key**: Better name extraction requires `OPENAI_API_KEY` in `.env` file\n\n"
            warning_msg += "3. **Filename matching**: Include your name in the filename (e.g., `vedant_blood_test.pdf`)\n\n"
            warning_msg += "4. **Manual verification**: The system couldn't automatically match these reports to you\n"
            
            return jsonify({
                "success": False,
                "error": "Name of the Reports does not match the name assocated with this Profile",
                "message": warning_msg,
                "mismatched_count": len(mismatched_reports),
                "pending_count": len(pending_reports),
                "user_display_name": user_display_name,
                "mismatched_files": [
                    {
                        "file_name": r['file_name'],
                        "patient_name": r.get('patient_name'),
                        "confidence": r.get('name_match_confidence')
                    }
                    for r in mismatched_reports
                ],
                "pending_files": [
                    {
                        "file_name": r['file_name'],
                        "patient_name": r.get('patient_name')
                    }
                    for r in pending_reports
                ]
            }), 404
        
        # Use ONLY matched reports for summary
        reports = matched_reports
        log_step("Using reports", "success", f"{len(reports)} matched reports for '{user_display_name}'")
        
        # Compute signature
        log_step("Computing signature", "start")
        current_signature = sb.compute_signature_from_reports(reports)
        log_step("Signature", "success", current_signature[:16] + "...")
        
        # Check cache
        if use_cache and not force_regenerate:
            log_step("Checking cache", "start")
            cached = sb.get_cached_summary(profile_id, 'reports', current_signature)
            
            if cached and cached.get('summary_text'):
                summary_text = cached['summary_text']
                
                # Add mismatched warnings to cached summary
                if mismatched_reports:
                    mismatch_warning = build_mismatch_warning(mismatched_reports, user_display_name)
                    summary_text = mismatch_warning + "\n\n---\n\n" + summary_text
                
                if not summary_text.startswith('❌') and len(summary_text) > 100:
                    log_step("Cache", "success", "Using cached summary (with warnings)")
                    return jsonify({
                        "success": True,
                        "summary": summary_text,
                        "report_count": len(reports),
                        "mismatched_count": len(mismatched_reports),
                        "folder_type": 'reports',
                        "cached": True,
                        "generated_at": cached.get('generated_at'),
                        "model": "gpt-4.1-nano",
                        "user_display_name": user_display_name
                    }), 200
            
            log_step("Cache", "info", "Cache miss - generating new summary")
        
        # Create chunks
        log_step("Creating chunks", "start")
        all_chunks = []
        
        for idx, report in enumerate(reports, 1):
            extracted = report.get('extracted_text') or ""
            
            if not extracted.strip():
                log_step(f"Report {idx}", "warning", f"Empty text in {report.get('file_name')}")
                continue
            
            cleaned = clean_text(extracted)
            # Use chunk_text_with_metadata so every chunk carries its source
            # filename as doc_id.  embed_store.build_faiss_index() persists
            # this through chunks.pkl; rag_query.smart_context_assembly() uses
            # it for exact per-document diversity grouping instead of the old
            # integer-division boundary approximation.
            doc_id = report.get('file_name') or f"report_{idx}"
            chunks = chunk_text_with_metadata(
                cleaned,
                doc_id=doc_id,
                max_words=500,
                overlap_words=100,
            )
            
            print(f"  Report {idx}/{len(reports)}: {report.get('file_name')}", flush=True)
            print(f"    Patient: {report.get('patient_name')} ✅", flush=True)
            print(f"    {len(extracted)} chars → {len(cleaned)} cleaned → {len(chunks)} chunks", flush=True)
            
            all_chunks.extend(chunks)
        
        log_step("Chunking", "success", f"{len(all_chunks)} total chunks")
        
        if not all_chunks:
            log_step("Chunks", "error", "No valid chunks created")
            return jsonify({
                "success": False,
                "error": "Could not create chunks from reports"
            }), 500
        
        # Build FAISS index
        log_step("Building index", "start")
        try:
            index, chunks, vectorizer = build_faiss_index(all_chunks, temp_dir)
            log_step("Index", "success", "FAISS index ready")
            
        except Exception as e:
            log_step("Index", "error", str(e))
            traceback.print_exc()
            return internal_error_response("Failed to build medical search index")
        
        # Generate summary
        log_step("Generating summary", "start")
        try:
            # Prepare patient metadata
            patient_metadata = {
                'patient_name': user_display_name,
                'age': reports[0].get('age') if reports else None,
                'gender': reports[0].get('gender') if reports else None,
                'dates': [r.get('report_date') for r in reports if r.get('report_date')]
            }
            
            summary = ask_rag_improved(
                question=f"Analyze all medical test reports for {user_display_name} and provide a comprehensive summary with trends",
                temp_dir=temp_dir,
                folder_type='reports',
                num_reports=len(reports),
                patient_metadata=patient_metadata
            )
            
            if summary.startswith("❌"):
                log_step("Summary", "error", summary)
                return jsonify({
                    "success": False,
                    "error": summary
                }), 500
            
            log_step("Summary", "success", f"{len(summary)} chars")
            
            # Add mismatched warnings to the TOP of summary
            if mismatched_reports:
                mismatch_warning = build_mismatch_warning(mismatched_reports, user_display_name)
                summary = mismatch_warning + "\n\n---\n\n" + summary
                log_step("Warnings added", "success", f"{len(mismatched_reports)} mismatched reports")
            
        except Exception as e:
            log_step("Summary", "error", str(e))
            traceback.print_exc()
            return internal_error_response("Failed to generate medical summary")
        
        # Cache summary (with warnings included)
        log_step("Caching", "start")
        try:
            sb.save_summary_cache(
                profile_id,
                'reports',
                summary,
                len(reports),
                current_signature
            )
            log_step("Cached", "success")
        except Exception as e:
            log_step("Cache save", "warning", f"Failed: {str(e)}")
        
        # Summary
        print(f"\n{'='*80}", flush=True)
        log_step("COMPLETE", "success")
        print(f"{'='*80}", flush=True)
        print(f"  User: {user_display_name}", flush=True)
        print(f"  Matched reports: {len(reports)} ✅", flush=True)
        print(f"  Mismatched reports: {len(mismatched_reports)} ⚠️", flush=True)
        print(f"  Summary: {len(summary)} chars", flush=True)
        print(f"  Model: gpt-4.1-nano", flush=True)
        print(f"{'='*80}\n", flush=True)
        
        return jsonify({
            "success": True,
            "summary": summary,
            "profile_id": profile_id,
            "report_count": len(reports),
            "mismatched_count": len(mismatched_reports),
            "folder_type": 'reports',
            "user_display_name": user_display_name,
            "cached": False,
            "model": "gpt-4.1-nano"
        }), 200
        
    except Exception as e:
        log_step("FATAL ERROR", "error", str(e))
        traceback.print_exc()

        return internal_error_response("Failed to generate medical summary")
    
    finally:
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
                log_step("Cleanup", "success", f"Removed {temp_dir}")
        except Exception as e:
            log_step("Cleanup", "warning", f"Failed to clean temp dir: {e}")


def build_mismatch_warning(mismatched_reports: list, user_display_name: str) -> str:
    """Build a user-friendly warning about mismatched reports"""
    
    warning = f"""# ⚠️ Important Notice

**Summary generated for:** {user_display_name}

**Reports included:** {len(mismatched_reports)} report(s) found that belong to different patients and were **NOT included** in this summary:

"""
    
    for report in mismatched_reports[:10]:  # Limit to 10
        patient_name = report.get('patient_name', 'Unknown Patient')
        file_name = report.get('file_name', 'Unknown File')
        report_date = report.get('report_date', 'Unknown Date')
        confidence = report.get('name_match_confidence', 0.0)
        
        warning += f"• **{file_name}**\n"
        warning += f"  - Patient Name: {patient_name}\n"
        warning += f"  - Date: {report_date}\n"
        warning += f"  - Name Similarity: {confidence*100:.0f}%\n\n"
    
    if len(mismatched_reports) > 10:
        warning += f"... and {len(mismatched_reports) - 10} more report(s)\n\n"
    
    warning += """**Action Required:**
These reports appear to belong to other people. If they are not yours:
1. Please delete them from your uploaded files
2. If they belong to family members, consider creating separate accounts for them

**Your Medical Summary (Below):**
The following summary contains ONLY reports that match your name ({}).

""".format(user_display_name)
    
    return warning


# ============================================
# HEALTH CHECK
# ============================================

@app.route("/api/health", methods=["GET"])
def health_check():
    """API health check"""
    log_step("Health check", "start")
    
    try:
        openai_ok = bool(os.getenv("OPENAI_API_KEY"))
        supabase_ok = sb.test_connection()

        if not openai_ok:
            log_step("OpenAI API", "warning", "API key not set")
        
        status = "healthy" if (supabase_ok and openai_ok) else "degraded"
        
        return jsonify({
            "status": status,
            "message": "Medical RAG API - Smart Name Filtering",
            "supabase": supabase_ok,
            "openai": openai_ok,
            "model": "gpt-4.1-nano",
            "mode": "smart_filtering_with_warnings",
            "timestamp": datetime.now().isoformat()
        }), 200
        
    except Exception as e:
        log_step("Health check", "error", str(e))
        return jsonify({
            "status": "unhealthy",
            "error": "Health check failed"
        }), 500


# ============================================
# GET REPORTS LIST
# ============================================

@app.route("/api/reports/<profile_id>", methods=["GET"])
def get_reports(profile_id):
    """Get list of processed reports with name match status"""
    log_step("GET REPORTS", "start", profile_id)
    
    try:
        folder_type = request.args.get('folder_type')
        reports = sb.get_processed_reports(profile_id, folder_type)
        
        # Get profile info
        user_info = sb.get_profile_info(profile_id)
        user_display_name = user_info.get('display_name', 'User') if user_info else 'User'
        
        # Simplify for list view
        simplified = []
        matched_count = 0
        mismatched_count = 0
        
        for r in reports:
            status = r.get('name_match_status', 'pending')
            if status == 'matched':
                matched_count += 1
            elif status == 'mismatched':
                mismatched_count += 1
            
            simplified.append({
                "id": r['id'],
                "file_name": r['file_name'],
                "folder_type": r['folder_type'],
                "patient_name": r.get('patient_name'),
                "report_date": r.get('report_date'),
                "report_type": r.get('report_type'),
                "processing_status": r['processing_status'],
                "processed_at": r.get('processed_at'),
                "text_length": len(r.get('extracted_text') or ""),
                "name_match_status": status,
                "name_match_confidence": r.get('name_match_confidence'),
                "belongs_to_user": status == 'matched'
            })
        
        log_step("Reports", "success", 
                f"{len(simplified)} reports (✅ {matched_count} matched, ⚠️ {mismatched_count} mismatched)")
        
        return jsonify({
            "success": True,
            "profile_id": profile_id,
            "reports": simplified,
            "count": len(simplified),
            "matched_count": matched_count,
            "mismatched_count": mismatched_count,
            "user_display_name": user_display_name
        }), 200
        
    except Exception as e:
        log_step("Error", "error", str(e))
        return internal_error_response("Failed to fetch processed reports")


# ============================================
# CLEAR CACHE
# ============================================

@app.route("/api/clear-cache/<profile_id>", methods=["DELETE"])
def clear_cache(profile_id):
    """Clear cached summaries"""
    log_step("CLEAR CACHE", "start", profile_id)
    
    try:
        deleted = sb.clear_user_cache(profile_id)
        log_step("Cache cleared", "success", f"{deleted} entries")
        
        return jsonify({
            "success": True,
            "message": f"Cache cleared for profile {profile_id}",
            "entries_deleted": deleted
        }), 200
        
    except Exception as e:
        log_step("Error", "error", str(e))
        return internal_error_response("Failed to clear cached summaries")


# ============================================
# CLEAR ALL DATA
# ============================================

@app.route("/api/clear/<profile_id>", methods=["DELETE"])
def clear_user_data(profile_id):
    """Clear all processed data"""
    log_step("CLEAR DATA", "start", profile_id)
    
    try:
        deleted = sb.clear_user_data(profile_id)
        log_step("Data cleared", "success", f"{deleted} records")
        
        return jsonify({
            "success": True,
            "message": f"Cleared data for profile {profile_id}",
            "records_deleted": deleted
        }), 200
        
    except Exception as e:
        log_step("Error", "error", str(e))
        return internal_error_response("Failed to clear processed medical data")


# ============================================
# DEBUG ENDPOINT
# ============================================

@app.route("/api/debug/<profile_id>", methods=["GET"])
def debug_user(profile_id):
    """Debug endpoint to check profile info and reports"""
    log_step("DEBUG", "start", profile_id)
    
    try:
        # Get profile info
        user_info = sb.get_profile_info(profile_id)
        
        # Get reports
        reports = sb.get_processed_reports(profile_id)
        
        # Analyze
        debug_info = {
            "profile_id": profile_id,
            "user_info": user_info,
            "user_display_name": user_info.get('display_name') if user_info else None,
            "total_reports": len(reports),
            "reports": []
        }
        
        for r in reports:
            debug_info["reports"].append({
                "file_name": r.get('file_name'),
                "patient_name": r.get('patient_name'),
                "name_match_status": r.get('name_match_status'),
                "name_match_confidence": r.get('name_match_confidence'),
                "report_date": r.get('report_date'),
                "extracted_text_preview": r.get('extracted_text', '')[:200]
            })
        
        return jsonify({
            "success": True,
            "debug_info": debug_info
        }), 200
        
    except Exception as e:
        log_step("Debug", "error", str(e))
        return internal_error_response("Failed to fetch debug information")


# ============================================
# ERROR HANDLERS
# ============================================

@app.errorhandler(404)
def not_found(error):
    return jsonify({
        "success": False,
        "error": "Endpoint not found"
    }), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({
        "success": False,
        "error": "Internal server error"
    }), 500


# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    print("\n" + "="*80, flush=True)
    print("🚀 MEDICAL RAG API SERVER (SMART NAME FILTERING)", flush=True)
    print("   Powered by: OpenAI gpt-4.1-nano", flush=True)
    print("   Mode: Filter by Name + Show Warnings in Summary ✅", flush=True)
    print("="*80, flush=True)
    print("\n📡 Endpoints:", flush=True)
    print("  GET    /api/health", flush=True)
    print("  POST   /api/process-files", flush=True)
    print("  POST   /api/generate-summary", flush=True)
    print("  GET    /api/reports/<profile_id>", flush=True)
    print("  DELETE /api/clear-cache/<profile_id>", flush=True)
    print("  DELETE /api/clear/<profile_id>", flush=True)
    print("\n💡 How It Works:", flush=True)
    print("  1️⃣  Processes all uploaded files", flush=True)
    print("  2️⃣  Matches report names with profiles.display_name (fallback: personal.display_name)", flush=True)
    print("  3️⃣  Generates summary ONLY from matched reports", flush=True)
    print("  4️⃣  Shows mismatched reports as warnings IN the summary", flush=True)
    print("  5️⃣  User sees their summary + knows about other reports", flush=True)
    print("\n✅ User Experience:", flush=True)
    print("  • Summary generated for their own reports", flush=True)
    print("  • Warnings shown about reports belonging to others", flush=True)
    print("  • Clear action items (delete or separate accounts)", flush=True)
    print("  • No errors, always informative", flush=True)
    print("\n" + "="*80 + "\n", flush=True)
    
    port = int(os.environ.get("PORT", 8000))
    app.run(debug=False, host="0.0.0.0", port=port)