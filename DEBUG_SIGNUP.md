# Quick Debug Steps

## 1. Restart Next.js Server
```bash
# Stop the current server (Ctrl+C) then:
npm run dev
```

## 2. Check Postgres Logs
```bash
# View recent Postgres logs
supabase logs db --limit 50
```

## 3. Test the trigger manually
```sql
-- Connect to DB
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres

-- Check if trigger exists
SELECT tgname, tgrelid::regclass, tgfoid::regproc 
FROM pg_trigger 
WHERE tgname LIKE '%profile%';

-- Check if function exists
\df handle_new_profile_personal

-- Try creating a test profile manually
INSERT INTO profiles (user_id, name, avatar_type, is_primary)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test', 'default', false)
RETURNING id;

-- Check if personal entry was created
SELECT * FROM personal WHERE profile_id = '<the-id-from-above>';
```

## 4. Share the actual error
Please share the **exact error message** from either:
- Postgres logs (`supabase logs db`)
- Browser console (F12 → Console tab)
