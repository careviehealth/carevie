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
from concurrent.futures import ThreadPoolExecutor

from rag_pipeline.clean_chunk import clean_text, chunk_text, chunk_text_with_metadata
from rag_pipeline.embed_store import build_faiss_index
from rag_pipeline.rag_query import ask_rag_improved
from rag_pipeline.extract_metadata import extract_metadata_batch
from internal_auth import authorize_internal_request
import supabase_helper as sb

from rag_pipeline.extractor_OCR import extract_text_from_bytes
from rag_pipeline.profile_checker import (
    verify_patient_name,
    filter_reports_by_name,
    INVALID_NAME_TOKENS,
)


app = Flask(__name__)

EXEMPT_INTERNAL_AUTH_PATHS = {"/api/health"}

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
    """Consistent logging utility"""
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


def resolve_profile_id(data: dict) -> str:
    """Resolve profile ID from request payload."""
    if not data:
        return None

    raw_profile_id = data.get("profile_id")
    if raw_profile_id is None:
        return None

    profile_id = str(raw_profile_id).strip()
    return profile_id or None


def _verify_and_build_record(
    file_info: dict,
    file_path: str,
    extracted_text: str,
    metadata: dict,
    folder_type: str,
    profile_id: str,
    user_display_name: str,
) -> dict:
    """
    Run name verification against the profile display name and return a
    fully-populated record dict ready for database insertion.
    """
    file_name = file_info.get('name')

    report_patient_name = metadata.get('patient_name')
    age           = metadata.get('age')
    gender        = metadata.get('gender')
    report_date   = metadata.get('report_date')
    report_type   = metadata.get('report_type')
    doctor_name   = metadata.get('doctor_name')
    hospital_name = metadata.get('hospital_name')

    name_match_status     = 'pending'
    name_match_confidence = 0.0

    # Regex fallback for patient name if LLM extraction fails
    if not report_patient_name or str(report_patient_name).lower() in INVALID_NAME_TOKENS:
        name_patterns = [
            r"(?:MR\.|MRS\.|MS\.|DR\.)\s+([A-Z]+(?:\s+[A-Z]+)+)",
            r"Patient\s*Name\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
            r"Name\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)",
        ]
        for pattern in name_patterns:
            m = re.search(pattern, extracted_text[:500], re.IGNORECASE)
            if m:
                report_patient_name = m.group(1).strip()
                break

    # Verify patient name against profile
    verification = verify_patient_name(
        report_name=report_patient_name,
        profile_name=user_display_name,
        threshold=0.4,
    )

    if verification['status'] in ('matched', 'mismatched'):
        name_match_status     = verification['status']
        name_match_confidence = verification['confidence']
    else:
        # Fallback: Check if user's name appears in the filename
        file_name_lower  = file_name.lower()
        user_name_parts  = user_display_name.lower().split()
        name_in_filename = any(
            part in file_name_lower for part in user_name_parts if len(part) > 2
        )
        if name_in_filename:
            name_match_status     = 'matched'
            name_match_confidence = 0.6

    save_kwargs = dict(
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
        name_match_confidence=name_match_confidence,
    )

    result_entry = dict(
        file_name=file_name,
        status="success",
        folder_type=folder_type,
        patient_name=report_patient_name,
        report_date=report_date,
        report_type=report_type,
        text_length=len(extracted_text),
        name_match_status=name_match_status,
        name_match_confidence=name_match_confidence,
    )

    return dict(
        save_kwargs=save_kwargs,
        result_entry=result_entry,
        match_status=name_match_status,
        match_confidence=name_match_confidence,
    )


@app.route("/api/process-files", methods=["POST"])
def process_files():
    """Process user files with name matching."""
    print("\n" + "="*80, flush=True)
    log_step("PROCESS FILES", "start")
    print("="*80, flush=True)

    try:
        data = request.get_json()

        profile_id = resolve_profile_id(data)
        if not profile_id:
            return jsonify({"success": False, "error": "profile_id is required"}), 400

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

        # List files in storage
        log_step("Fetching files", "start")
        files = sb.list_user_files(profile_id, folder_type)

        if not files:
            log_step("Files", "warning", "No files in storage")
            try:
                deleted = sb.delete_orphaned_report_records(profile_id, folder_type)
                log_step("Cleanup", "success", f"Deleted {deleted} orphaned records")
            except Exception as e:
                log_step("Cleanup", "error", str(e))
            return jsonify({"success": False,
                            "error": "No files found for this profile"}), 404

        log_step("Files found", "success", f"{len(files)} files")

        # Check existing processed records
        log_step("Checking processed", "start")
        existing_records = sb.get_processed_reports(profile_id, folder_type)

        storage_paths  = {f"{profile_id}/{folder_type}/{f.get('name')}" for f in files}
        existing_paths = {r['file_path'] for r in existing_records}

        # Delete orphaned records
        orphaned = [r for r in existing_records if r['file_path'] not in storage_paths]
        deleted_count = 0
        if orphaned:
            log_step("Removing orphaned", "start")
            orphaned_ids = [record['id'] for record in orphaned]
            try:
                deleted_count = sb.delete_report_records_bulk(orphaned_ids)
                log_step("Bulk deleted", "success",
                         f"{deleted_count} orphaned records removed")
            except Exception as e:
                log_step("Bulk delete failed", "error", str(e))

        # Partition into already-processed and new files
        results            = []
        skipped            = 0
        failed             = 0
        matched_reports    = 0
        mismatched_reports = 0

        new_files = []
        for file_info in files:
            file_name = file_info.get('name')
            file_path = f"{profile_id}/{folder_type}/{file_name}"
            if file_path in existing_paths:
                log_step("Status", "info", f"Already processed (skipping): {file_name}")
                results.append({
                    "file_name": file_name,
                    "status": "skipped",
                    "message": "Already processed"
                })
                skipped += 1
            else:
                new_files.append((file_info, file_path))

        log_step("Processing new files", "start",
                 f"{len(new_files)} new / {skipped} already skipped")

        if new_files:
            # Phase 1: Concurrent file downloads
            log_step("Download phase", "start",
                     f"Fetching {len(new_files)} files concurrently (max_workers=4)")

            def _download(args):
                fi, fp = args
                try:
                    return (fi, fp, sb.get_file_bytes(fp), None)
                except Exception as exc:
                    return (fi, fp, None, exc)

            with ThreadPoolExecutor(max_workers=4) as pool:
                download_results = list(pool.map(_download, new_files))

            dl_ok  = sum(1 for *_, err in download_results if err is None)
            dl_err = len(download_results) - dl_ok
            log_step("Download phase", "success",
                     f"{dl_ok} succeeded, {dl_err} failed")

            # Phase 2: Sequential OCR
            log_step("OCR phase", "start")
            ocr_results = []

            for idx, (fi, fp, file_bytes, dl_exc) in enumerate(download_results, 1):
                file_name = fi.get('name')
                print(f"\n{'─'*80}", flush=True)
                print(f"OCR {idx}/{len(download_results)}: {file_name}", flush=True)
                print(f"{'─'*80}", flush=True)

                if dl_exc is not None:
                    log_step("Download failed", "error",
                             f"{file_name}: {dl_exc}")
                    results.append({
                        "file_name": file_name,
                        "status": "failed",
                        "error": "Download failed"
                    })
                    failed += 1
                    continue

                try:
                    file_ext       = os.path.splitext(file_name)[1]
                    extracted_text = extract_text_from_bytes(file_bytes, file_ext)

                    if not extracted_text or len(extracted_text.strip()) < 50:
                        raise Exception(
                            f"Insufficient text extracted: "
                            f"{len(extracted_text.strip()) if extracted_text else 0} chars"
                        )

                    log_step("OCR", "success", f"{len(extracted_text)} chars")
                    ocr_results.append((fi, fp, extracted_text))

                except Exception as exc:
                    log_step("OCR failed", "error", f"{file_name}: {exc}")
                    results.append({
                        "file_name": file_name,
                        "status": "failed",
                        "error": "OCR failed"
                    })
                    failed += 1

            # Phase 3: Batch LLM metadata extraction
            if ocr_results:
                log_step("Metadata batch", "start",
                         f"Extracting metadata for {len(ocr_results)} "
                         f"files concurrently")

                batch_inputs = [
                    (text, fi.get('name'))
                    for fi, _, text in ocr_results
                ]
                metadata_list = extract_metadata_batch(batch_inputs)

                log_step("Metadata batch", "success",
                         f"{len(metadata_list)} results received")

                # Phase 4: Sequential name verification
                log_step("Name verification phase", "start")
                verified_records = []

                for (fi, fp, extracted_text), metadata in zip(ocr_results, metadata_list):
                    file_name = fi.get('name')
                    log_step("Verifying", "info", file_name)

                    record = _verify_and_build_record(
                        file_info=fi,
                        file_path=fp,
                        extracted_text=extracted_text,
                        metadata=metadata,
                        folder_type=folder_type,
                        profile_id=profile_id,
                        user_display_name=user_display_name,
                    )

                    conf   = record['match_confidence']
                    status = record['match_status']

                    if status == 'matched' and conf >= 0.7:
                        matched_reports += 1
                        log_step("Name verification", "success",
                                 f"MATCH {conf:.2f} – "
                                 f"'{record['result_entry']['patient_name']}' "
                                 f"vs '{user_display_name}'")
                    elif status == 'matched':
                        matched_reports += 1
                        log_step("Name verification", "warning",
                                 f"PARTIAL MATCH {conf:.2f} – "
                                 f"'{record['result_entry']['patient_name']}' "
                                 f"vs '{user_display_name}' (including in summary)")
                    elif status == 'mismatched':
                        mismatched_reports += 1
                        log_step("Name verification", "warning",
                                 f"MISMATCH {conf:.2f} – "
                                 f"Report '{record['result_entry']['patient_name']}' "
                                 f"vs User '{user_display_name}'")
                    else:
                        log_step("Name verification", "info",
                                 "Patient name unclear – marked pending")

                    verified_records.append(record)

                # Phase 5: Concurrent DB saves
                log_step("DB save phase", "start",
                         f"Saving {len(verified_records)} records concurrently "
                         f"(max_workers=4)")

                def _save(record: dict):
                    try:
                        record_id = sb.save_extracted_data(**record['save_kwargs'])
                        return (record_id, None)
                    except Exception as exc:
                        return (None, exc)

                with ThreadPoolExecutor(max_workers=4) as pool:
                    save_outcomes = list(pool.map(_save, verified_records))

                for record, (record_id, save_exc) in zip(verified_records, save_outcomes):
                    entry = record['result_entry'].copy()
                    if save_exc is not None:
                        log_step("DB save failed", "error",
                                 f"{entry['file_name']}: {save_exc}")
                        entry['status'] = 'failed'
                        entry['error']  = 'DB save failed'
                        failed += 1
                    else:
                        entry['record_id'] = record_id
                    results.append(entry)

                log_step("DB save phase", "success",
                         f"{sum(1 for _, e in save_outcomes if e is None)} records saved")

        successful_count = sum(1 for r in results if r.get('status') == 'success')

        # Clear cache if anything changed
        if deleted_count > 0 or successful_count > 0:
            log_step("Clearing cache", "start")
            try:
                cache_cleared = sb.clear_user_cache(profile_id)
                log_step("Cache cleared", "success", f"{cache_cleared} entries")
            except Exception as e:
                log_step("Cache clear failed", "error", str(e))

        print(f"\n{'='*80}", flush=True)
        log_step("COMPLETE", "success")
        print(f"{'='*80}", flush=True)
        print(f"  User: {user_display_name}", flush=True)
        print(f"  Total: {len(files)}", flush=True)
        print(f"  ✅ Processed: {successful_count}", flush=True)
        print(f"  ⏭️  Skipped: {skipped}", flush=True)
        print(f"  🗑️  Deleted: {deleted_count}", flush=True)
        print(f"  ❌ Failed: {failed}", flush=True)
        print(f"  ✅ Matched: {matched_reports}", flush=True)
        print(f"  ⚠️  Mismatched: {mismatched_reports}", flush=True)
        print(f"{'='*80}\n", flush=True)

        return jsonify({
            "success": True,
            "message": f"Processed {successful_count} files, skipped {skipped}",
            "profile_id": profile_id,
            "processed_count": successful_count,
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


@app.route("/api/generate-summary", methods=["POST"])
def generate_summary():
    """Generate summary for matched reports and display warnings for mismatches."""
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

        use_cache        = data.get("use_cache", True)
        force_regenerate = data.get("force_regenerate", False)
        folder_type      = 'reports'

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
        matched_reports    = []
        mismatched_reports = []
        pending_reports    = []

        for report in all_reports:
            status = report.get('name_match_status', 'pending')
            if status == 'matched':
                matched_reports.append(report)
            elif status == 'mismatched':
                mismatched_reports.append(report)
            else:
                pending_reports.append(report)

        log_step("Report analysis", "info",
                 f"Matched: {len(matched_reports)}, "
                 f"Mismatched: {len(mismatched_reports)}, "
                 f"Pending: {len(pending_reports)}")

        # Guard: no matched reports
        if len(matched_reports) == 0:
            log_step("Matched reports", "error", "No matched reports found")

            warning_msg = f"## ⚠️ No Reports Found for '{user_display_name}'\n\n"

            if mismatched_reports:
                warning_msg += (
                    f"**Found {len(mismatched_reports)} report(s) for different patients:**\n\n"
                )
                for r in mismatched_reports[:5]:
                    warning_msg += (
                        f"- **{r['file_name']}**: "
                        f"Patient name '{r.get('patient_name', 'Unknown')}'\n"
                    )
                warning_msg += "\n"

            if pending_reports:
                warning_msg += (
                    f"**Found {len(pending_reports)} report(s) with unclear patient names:**\n\n"
                )
                for r in pending_reports[:5]:
                    warning_msg += f"- **{r['file_name']}**\n"
                warning_msg += "\n"

            warning_msg += "### 🔧 Possible Solutions:\n\n"
            warning_msg += (
                "1. **Check your display name**: Make sure your profile display name "
                "matches the name in your reports\n"
                f"   - Current display name: **{user_display_name}**\n"
                "   - Report patient names: " +
                ", ".join(
                    f"'{r.get('patient_name', 'Unknown')}'"
                    for r in all_reports[:3]
                ) + "\n\n"
                "2. **Add OpenAI API key**: Better name extraction requires "
                "`OPENAI_API_KEY` in `.env` file\n\n"
                "3. **Filename matching**: Include your name in the filename "
                "(e.g., `vedant_blood_test.pdf`)\n\n"
                "4. **Manual verification**: The system couldn't automatically "
                "match these reports to you\n"
            )

            return jsonify({
                "success": False,
                "error": "Name of the Reports does not match the name associated with this Profile",
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

        # Use ONLY matched reports for the summary
        reports = matched_reports
        log_step("Using reports", "success",
                 f"{len(reports)} matched reports for '{user_display_name}'")

        # Compute signature & check cache
        log_step("Computing signature", "start")
        current_signature = sb.compute_signature_from_reports(reports)
        log_step("Signature", "success", current_signature[:16] + "...")

        if use_cache and not force_regenerate:
            log_step("Checking cache", "start")
            cached = sb.get_cached_summary(profile_id, 'reports', current_signature)

            if cached and cached.get('summary_text'):
                summary_text = cached['summary_text']

                if mismatched_reports:
                    mismatch_warning = build_mismatch_warning(
                        mismatched_reports, user_display_name
                    )
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

            log_step("Cache", "info", "Cache miss – generating new summary")

        # Concurrent text chunking
        log_step("Creating chunks (concurrent)", "start")

        def _chunk_report(args):
            idx, report = args
            extracted = report.get('extracted_text') or ""
            if not extracted.strip():
                return idx, report, []
            cleaned = clean_text(extracted)
            doc_id  = report.get('file_name') or f"report_{idx}"
            chunks  = chunk_text_with_metadata(
                cleaned,
                doc_id=doc_id,
                max_words=500,
                overlap_words=100,
            )
            return idx, report, chunks

        with ThreadPoolExecutor(max_workers=4) as pool:
            chunk_results = list(pool.map(_chunk_report, enumerate(reports, 1)))

        chunk_results.sort(key=lambda x: x[0])

        all_chunks = []
        for idx, report, chunks in chunk_results:
            if not chunks:
                log_step(f"Report {idx}", "warning",
                         f"Empty text in {report.get('file_name')}")
                continue

            extracted = report.get('extracted_text') or ""
            cleaned   = clean_text(extracted)
            print(f"  Report {idx}/{len(reports)}: {report.get('file_name')}",
                  flush=True)
            print(f"    Patient: {report.get('patient_name')} ✅", flush=True)
            print(
                f"    {len(extracted)} chars → {len(cleaned)} cleaned "
                f"→ {len(chunks)} chunks",
                flush=True,
            )
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
            patient_metadata = {
                'patient_name': user_display_name,
                'age':    reports[0].get('age')    if reports else None,
                'gender': reports[0].get('gender') if reports else None,
                'dates':  [r.get('report_date') for r in reports
                           if r.get('report_date')]
            }

            summary = ask_rag_improved(
                question=(
                    f"Analyze all medical test reports for {user_display_name} "
                    f"and provide a comprehensive summary with trends"
                ),
                temp_dir=temp_dir,
                folder_type='reports',
                num_reports=len(reports),
                patient_metadata=patient_metadata
            )

            if summary.startswith("❌"):
                log_step("Summary", "error", summary)
                return jsonify({"success": False, "error": summary}), 500

            log_step("Summary", "success", f"{len(summary)} chars")

            if mismatched_reports:
                mismatch_warning = build_mismatch_warning(
                    mismatched_reports, user_display_name
                )
                summary = mismatch_warning + "\n\n---\n\n" + summary
                log_step("Warnings added", "success",
                         f"{len(mismatched_reports)} mismatched reports")

        except Exception as e:
            log_step("Summary", "error", str(e))
            traceback.print_exc()
            return internal_error_response("Failed to generate medical summary")

        # Cache summary
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
    """Build a user-friendly warning string about mismatched reports."""
    warning = (
        f"# ⚠️ Important Notice\n\n"
        f"**Summary generated for:** {user_display_name}\n\n"
        f"**Reports included:** {len(mismatched_reports)} report(s) found that belong "
        f"to different patients and were **NOT included** in this summary:\n\n"
    )

    for report in mismatched_reports[:10]:
        patient_name = report.get('patient_name', 'Unknown Patient')
        file_name    = report.get('file_name', 'Unknown File')
        report_date  = report.get('report_date', 'Unknown Date')
        confidence   = report.get('name_match_confidence', 0.0)

        warning += (
            f"• **{file_name}**\n"
            f"  - Patient Name: {patient_name}\n"
            f"  - Date: {report_date}\n"
            f"  - Name Similarity: {confidence * 100:.0f}%\n\n"
        )

    if len(mismatched_reports) > 10:
        warning += f"... and {len(mismatched_reports) - 10} more report(s)\n\n"

    warning += (
        "**Action Required:**\n"
        "These reports appear to belong to other people. If they are not yours:\n"
        "1. Please delete them from your uploaded files\n"
        "2. If they belong to family members, consider creating separate accounts for them\n\n"
        f"**Your Medical Summary (Below):**\n"
        f"The following summary contains ONLY reports that match your name "
        f"({user_display_name}).\n"
    )

    return warning


@app.route("/api/health", methods=["GET"])
def health_check():
    """API health check endpoint."""
    log_step("Health check", "start")

    try:
        openai_ok  = bool(os.getenv("OPENAI_API_KEY"))
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


@app.route("/api/reports/<profile_id>", methods=["GET"])
def get_reports(profile_id):
    """Get list of processed reports with name match status."""
    log_step("GET REPORTS", "start", profile_id)

    try:
        folder_type = request.args.get('folder_type')
        reports     = sb.get_processed_reports(profile_id, folder_type)

        user_info         = sb.get_profile_info(profile_id)
        user_display_name = (
            user_info.get('display_name', 'User') if user_info else 'User'
        )

        simplified      = []
        matched_count   = 0
        mismatched_count = 0

        for r in reports:
            status = r.get('name_match_status', 'pending')
            if status == 'matched':
                matched_count += 1
            elif status == 'mismatched':
                mismatched_count += 1

            simplified.append({
                "id":                  r['id'],
                "file_name":           r['file_name'],
                "folder_type":         r['folder_type'],
                "patient_name":        r.get('patient_name'),
                "report_date":         r.get('report_date'),
                "report_type":         r.get('report_type'),
                "processing_status":   r['processing_status'],
                "processed_at":        r.get('processed_at'),
                "text_length":         len(r.get('extracted_text') or ""),
                "name_match_status":   status,
                "name_match_confidence": r.get('name_match_confidence'),
                "belongs_to_user":     status == 'matched'
            })

        log_step(
            "Reports", "success",
            f"{len(simplified)} reports "
            f"(✅ {matched_count} matched, ⚠️ {mismatched_count} mismatched)"
        )

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


@app.route("/api/clear-cache/<profile_id>", methods=["DELETE"])
def clear_cache(profile_id):
    """Clear cached summaries."""
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


@app.route("/api/clear/<profile_id>", methods=["DELETE"])
def clear_user_data(profile_id):
    """Clear all processed data for a user."""
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


@app.route("/api/debug/<profile_id>", methods=["GET"])
def debug_user(profile_id):
    """Debug endpoint to check profile info and reports."""
    log_step("DEBUG", "start", profile_id)

    try:
        user_info = sb.get_profile_info(profile_id)
        reports   = sb.get_processed_reports(profile_id)

        debug_info = {
            "profile_id":       profile_id,
            "user_info":        user_info,
            "user_display_name": user_info.get('display_name') if user_info else None,
            "total_reports":    len(reports),
            "reports":          []
        }

        for r in reports:
            debug_info["reports"].append({
                "file_name":              r.get('file_name'),
                "patient_name":           r.get('patient_name'),
                "name_match_status":      r.get('name_match_status'),
                "name_match_confidence":  r.get('name_match_confidence'),
                "report_date":            r.get('report_date'),
                "extracted_text_preview": r.get('extracted_text', '')[:200]
            })

        return jsonify({
            "success": True,
            "debug_info": debug_info
        }), 200

    except Exception as e:
        log_step("Debug", "error", str(e))
        return internal_error_response("Failed to fetch debug information")


@app.errorhandler(404)
def not_found(error):
    return jsonify({"success": False, "error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"success": False, "error": "Internal server error"}), 500


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
    print("  1️⃣  Concurrent download of all new files (ThreadPoolExecutor)", flush=True)
    print("  2️⃣  Sequential OCR (PaddleOCR → EasyOCR fallback)", flush=True)
    print("  3️⃣  Batch LLM metadata extraction (asyncio.gather)", flush=True)
    print("  4️⃣  Name matching against profiles.display_name", flush=True)
    print("  5️⃣  Concurrent DB saves (ThreadPoolExecutor)", flush=True)
    print("  6️⃣  Summary generated ONLY from matched reports", flush=True)
    print("  7️⃣  Mismatched reports shown as warnings in the summary", flush=True)
    print("\n✅ User Experience:", flush=True)
    print("  • Summary generated for their own reports", flush=True)
    print("  • Warnings shown about reports belonging to others", flush=True)
    print("  • Clear action items (delete or separate accounts)", flush=True)
    print("  • No errors, always informative", flush=True)
    print("\n" + "="*80 + "\n", flush=True)

    port = int(os.environ.get("PORT", 8000))
    app.run(debug=False, host="0.0.0.0", port=port)