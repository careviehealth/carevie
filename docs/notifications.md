# Notifications platform

A single canonical pipeline that produces, schedules, delivers, and tracks every notification — in-app and Web Push — across the app.

## Architecture (one-screen overview)

```
Domain event ──► emitter ──► repository.upsertNotification ──► user_notifications row
                                  │
                                  └─► enqueueJob ──► notification_jobs (durable queue)
                                                            │
                          /api/cron/notifications  ─► claim_notification_jobs
                                                            │
                                                  ┌─────────┴─────────┐
                                                  ▼                   ▼
                                         materialize_reminder    deliver_push
                                            (re-evaluates)       (web-push lib)
                                                                       │
                                                                       ▼
                                                          notification_endpoints
                                                                       │
                                                                       ▼
                                                          notification_deliveries
```

- **One source of truth** is `user_notifications`. The bell panel reads it via `GET /api/notifications/list`. The service worker `push` handler displays the same row.
- **All scheduling** runs through `notification_jobs`. Schedulers (medication / appointment / care-circle) compute the next runs and enqueue jobs, idempotent on `(job_type, dedupe_key)`.
- **Reconciliation** re-derives the canonical schedule from the latest source state. The cron tick reconciles drift; the homepage hits `/api/notifications/reconcile` directly when the user mutates their own data.
- **Permissions** are enforced at *generation* time: care-circle emitters consult `care_circle_permissions` before fanning out a notification to a member.

## Categories

`medication_due`, `medication_missed`, `appointment_upcoming`, `appointment_changed`, `care_circle_invite_received`, `care_circle_invite_accepted`, `care_circle_member_activity`, `vault_document_uploaded`, `medical_summary_ready`.

Per-user channel + per-category preferences live in `notification_preferences`. Quiet hours are honored at delivery time.

## Environment variables

Required in every environment that runs the API:

| Variable | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client for queue / endpoint writes. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase URL (already used by client). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon Supabase key (already used by client). |
| `VAPID_SUBJECT` | `mailto:` URI used as the contact for push providers. |
| `VAPID_PUBLIC_KEY` | Server-side VAPID public key. |
| `VAPID_PRIVATE_KEY` | Server-side VAPID private key (secret). |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same as `VAPID_PUBLIC_KEY`, exposed to the browser to seed `PushManager.subscribe`. Must match the server key exactly. |
| `CRON_SECRET` | Bearer token required by `/api/cron/notifications` (the localhost fallback only kicks in when this is unset *and* the request comes from `127.0.0.1`). |

## Generating VAPID keys

```bash
npx web-push generate-vapid-keys
```

Copy `publicKey` into both `VAPID_PUBLIC_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Copy `privateKey` into `VAPID_PRIVATE_KEY`. Set `VAPID_SUBJECT=mailto:ops@yourdomain.com`. Rotating keys invalidates every existing browser subscription — only do this if you accept that every user has to re-enable browser alerts.

## Local dev

```bash
npm install
# put the env vars above into .env.local
npm run dev
```

Service worker only registers over HTTPS or `http://localhost`, so push works in dev. To trigger the cron loop manually:

```bash
curl -X POST http://localhost:3000/api/cron/notifications
```

(no Authorization header needed when `CRON_SECRET` is unset and the request hits localhost)

## Production

`vercel.json` registers the cron at `* * * * *` (every minute). Set `CRON_SECRET` in the Vercel project; Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}` on its scheduled invocations. The handler refuses unauthenticated calls in production.

## Operational checks

- **No deliveries going out?** Hit `/api/cron/notifications` manually and watch the response — it returns `{ drained, succeeded, failed }`. If `drained === 0` the queue is empty; otherwise look at `notification_jobs.last_error`.
- **A user reports missing alerts.** Confirm a row exists in `notification_endpoints` for their `user_id` with `disabled_at IS NULL` and `invalidated_at IS NULL`. If their endpoint was 410'd by the push provider it will have been auto-invalidated.
- **Duplicate alerts.** Every emitter must compute a stable `dedupe_key`. If you see dupes, the upstream emitter is producing two different keys for the same logical event — check the generators in `src/lib/notifications/emitters/*` and `src/lib/notifications/schedulers/*`.

## Adding a new category

1. Append to `NOTIFICATION_CATEGORIES` in `src/lib/notifications/types.ts`.
2. Add an emitter under `src/lib/notifications/emitters/` that builds a stable `dedupeKey` and calls `upsertNotification`.
3. Wire the emitter into the domain code that produces the event.
4. (Optional) Add a scheduler under `src/lib/notifications/schedulers/` if the event needs to fire at a future time.
5. Add an icon + tone in `src/components/BackendNotificationsSection.tsx`.

## Why this shape

- **Queue with `FOR UPDATE SKIP LOCKED`** lets us scale workers horizontally without double-delivery.
- **Composite UNIQUE on `(user_id, dedupe_key)`** is the single source of dedupe — the application code does not need to "check before insert".
- **Owner-side reconciliation route** exists because the homepage talks to Supabase directly for med/appt mutations (no API hop), so the scheduler can't see the new state without an explicit nudge. Care-circle members go through `/api/care-circle/member/*`, which calls the schedulers inline.
