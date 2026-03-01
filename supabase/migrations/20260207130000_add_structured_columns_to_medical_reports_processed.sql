-- Persist structured extractor output per processed report.
-- This enables summary generation to reuse cached structured JSON
-- and avoid re-calling the extractor model on each summary cache miss.

alter table if exists public.medical_reports_processed
  add column if not exists structured_data_json jsonb,
  add column if not exists structured_data_hash text,
  add column if not exists structured_extracted_at timestamptz;

create index if not exists idx_medical_reports_processed_structured_hash
  on public.medical_reports_processed (structured_data_hash);
