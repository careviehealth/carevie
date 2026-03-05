-- ============================================================
-- DIAGNOSTIC + FIX: Find and fix all triggers causing signup failure
-- Run this ENTIRE script in Supabase SQL Editor
-- ============================================================

-- STEP 1: List ALL triggers on auth.users (to find the old one)
SELECT 
  t.tgname AS trigger_name,
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE n.nspname = 'auth' AND c.relname = 'users'
  AND NOT t.tgisinternal
ORDER BY t.tgname;
