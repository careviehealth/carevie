-- Remove legacy one-row-per-pair uniqueness so care_circle_links can support multi-profile rows.

BEGIN;

DO $$
DECLARE
  constraint_record RECORD;
  index_record RECORD;
BEGIN
  -- Drop unique constraints that enforce (requester_id, recipient_id) only.
  FOR constraint_record IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN LATERAL (
      SELECT array_agg(a.attname::text ORDER BY cols.ord) AS column_names
      FROM unnest(c.conkey) WITH ORDINALITY AS cols(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = cols.attnum
    ) keycols ON TRUE
    WHERE n.nspname = 'public'
      AND t.relname = 'care_circle_links'
      AND c.contype = 'u'
      AND keycols.column_names = ARRAY['requester_id', 'recipient_id']
  LOOP
    EXECUTE format(
      'ALTER TABLE public.care_circle_links DROP CONSTRAINT IF EXISTS %I',
      constraint_record.conname
    );
  END LOOP;

  -- Drop standalone unique indexes on (requester_id, recipient_id).
  FOR index_record IN
    SELECT i.relname AS index_name
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_constraint c ON c.conindid = i.oid
    JOIN LATERAL (
      SELECT array_agg(a.attname::text ORDER BY cols.ord) AS column_names
      FROM unnest(x.indkey) WITH ORDINALITY AS cols(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = cols.attnum
      WHERE cols.attnum > 0
    ) keycols ON TRUE
    WHERE n.nspname = 'public'
      AND t.relname = 'care_circle_links'
      AND x.indisunique = TRUE
      AND x.indisprimary = FALSE
      AND c.oid IS NULL
      AND keycols.column_names = ARRAY['requester_id', 'recipient_id']
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', index_record.index_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_care_circle_links_requester_recipient_profile_unique
  ON public.care_circle_links (requester_id, recipient_id, profile_id);

CREATE INDEX IF NOT EXISTS idx_care_circle_links_requester_recipient
  ON public.care_circle_links (requester_id, recipient_id);

COMMIT;
