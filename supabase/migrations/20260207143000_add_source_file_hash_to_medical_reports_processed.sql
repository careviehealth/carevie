-- Persist source file hash to avoid re-extracting identical files.

alter table if exists public.medical_reports_processed
  add column if not exists source_file_hash text;

create index if not exists idx_medical_reports_processed_source_file_hash
  on public.medical_reports_processed (source_file_hash);

create index if not exists idx_medical_reports_processed_user_source_file_hash
  on public.medical_reports_processed (user_id, source_file_hash);
