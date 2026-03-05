# Security Audit Report — Vytara SSR

This document summarizes security risks and improvement opportunities found during a codebase scan. Items are ordered by severity (Critical → High → Medium → Low → Hardening).

---

## Critical

### 1. Medical API has no authentication or authorization (IDOR)

**Location:** `src/app/api/medical/route.ts`

**Issue:** The route accepts `profile_id` in the request body and forwards it to the Flask backend for `process-files` and `generate-summary`. There is **no check** that the caller is the profile owner or has care-circle access. Any client can:

- Trigger processing of another user’s medical files.
- Generate and retrieve summaries for any profile by guessing or enumerating `profile_id` (UUIDs).

**Impact:** Unauthorized access to and processing of sensitive health data (IDOR).

**Recommendation:**

- Require authentication on `POST /api/medical` (e.g. reuse the same `getAuthenticatedUser` pattern used in other API routes).
- After resolving the user, verify that the authenticated user is allowed to act on `profile_id` (e.g. profile belongs to `auth_id` or user has care-circle access to that profile). Only then call the Flask backend with that `profile_id`.
- Optionally have the Next.js route derive `profile_id` from the session (e.g. selected profile) instead of trusting client-supplied `profile_id` for sensitive actions.

---

### 2. SOS API has no authentication

**Location:** `src/app/api/sos/route.ts`

**Issue:** `POST /api/sos` accepts `emergencyContacts` and `userName` and sends Twilio SMS to the listed numbers. There is no authentication. Any client can:

- Send arbitrary SMS to arbitrary numbers at your Twilio cost.
- Spoof “SOS” alerts with any `userName`.

**Impact:** Abuse (SMS bombing, cost, and reputational risk).

**Recommendation:**

- Require authentication (e.g. `getAuthenticatedUser`).
- Resolve the caller’s profile and load **server-side** the emergency contacts for that profile (from your DB), instead of accepting `emergencyContacts` from the request body. Optionally allow only a small, validated override (e.g. “use these numbers for this alert only” with rate limiting).
- Ensure the authenticated user is allowed to trigger SOS for the profile they’re acting on (e.g. own profile or care-circle member).

---

## High

### 3. Chat API has no authentication

**Location:** `src/app/api/chat/route.ts`

**Issue:** `POST /api/chat` proxies the request body to the Flask chatbot. There is no user or session check. Anyone can:

- Use your chatbot/LLM at your cost.
- Send arbitrary payloads to your backend.

**Impact:** Resource abuse and potential prompt injection / misuse of the assistant.

**Recommendation:**

- Require authentication (e.g. `getAuthenticatedUser`) and return 401 when not authenticated.
- Optionally bind usage to a user/profile for rate limiting or abuse detection.

---

### 4. Information disclosure in error responses

**Locations:** Multiple API routes (e.g. `src/app/api/sos/route.ts`, `src/app/api/profile/delete/route.ts`, and others).

**Issue:** Many handlers return `error.message` (or similar) in JSON for 4xx/5xx responses. Internal messages (e.g. DB errors, stack-related text) can leak to the client and help attackers.

**Examples:**

- SOS: `{ error: 'Internal server error', details: error.message }`
- Profile delete and others: `NextResponse.json({ message: someError.message }, { status: 500 })`

**Recommendation:**

- Log full errors server-side only.
- Return a generic message to the client (e.g. “An error occurred. Please try again.”) and a stable `code` or `error` identifier if needed for support. Avoid sending raw `error.message` or stack traces in production.

---

### 5. Medical summary HTML and XSS

**Location:** `src/components/MedicalSummaryModal.tsx` (around line 296)

**Issue:** The medical summary is rendered with `dangerouslySetInnerHTML` after a simple regex transform (e.g. `**text**` → `<strong>`, newlines → `<br/>`). If the backend or any upstream ever returns user-controlled or unsanitized content (e.g. names, OCR text, or LLM output that can be influenced), it could include HTML/script and lead to XSS.

**Recommendation:**

- Prefer rendering plain text and using React for formatting (e.g. split by `\n` and render `<br/>`, parse a small safe subset of markdown without raw HTML).
- If you must use `dangerouslySetInnerHTML`, run the content through a strict sanitizer (e.g. DOMPurify) and restrict to a small allowlist of tags/attributes. Ensure the backend does not emit raw HTML/script in the summary.

---

## Medium

### 6. No rate limiting

**Issue:** There is no application-level rate limiting in the Next.js app or in the API routes. Sensitive endpoints (OTP send/verify, SOS, chat, medical, login) can be brute-forced or abused (SMS/email bombing, LLM cost, enumeration).

**Recommendation:**

- Add rate limiting (e.g. by IP and/or by user/session) for:
  - `/api/auth/otp/send` and `/api/auth/otp/verify`
  - `/api/sos`
  - `/api/chat`
  - `/api/medical`
- Use Next.js middleware, Vercel rate limits, or a dedicated store (e.g. Redis) for limits. Prefer consistent limits across serverless instances if you use serverless.

---

### 7. No security headers (CSP, X-Frame-Options, etc.)

**Location:** `next.config.ts`

**Issue:** No `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, or similar headers are configured. This increases risk of clickjacking, MIME sniffing, and some XSS vectors.

**Recommendation:**

- Add security headers in `next.config.ts` (e.g. `headers` async function):
  - `X-Frame-Options: DENY` or `SAMEORIGIN`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin` (or stricter)
  - `Content-Security-Policy` with a strict policy (allow only required origins and inline scripts; avoid broad `unsafe-inline` if possible).

---

### 8. CORS wildcard subdomain in Flask

**Location:** `backend/app_api.py` (CORS config)

**Issue:** Origins include `"https://*.vercel.app"`. Any Vercel deployment (including a malicious one) could call your Flask API from the browser. If the API ever reflects origin or has cookie/credential behavior, this could be a concern.

**Recommendation:**

- Prefer an explicit list of allowed origins (e.g. production and staging domains). If you keep `*.vercel.app`, ensure the API does not rely on origin for sensitive authorization and that credentials are not sent to untrusted origins.

---

## Low / Hardening

### 9. Shared auth helper

**Issue:** Many routes implement a local `getAuthenticatedUser` (Bearer + cookie with Supabase). This is duplicated across several files, which can lead to subtle differences and makes it harder to add cross-cutting checks (e.g. rate limiting, logging).

**Recommendation:**

- Extract a single shared helper (e.g. `src/lib/auth.ts`: `getAuthenticatedUser(request)` and optionally `requireAuth(request)`) and use it in all protected routes, including the new protections for medical, SOS, and chat.

---

### 10. Client-exposed keys

**Location:** `src/components/ConveyThisProvider.tsx` (ConveyThis API key in script URL)

**Issue:** The ConveyThis key is in a `NEXT_PUBLIC_*` env and thus visible in the client. This is expected for many third-party frontend integrations.

**Recommendation:**

- Ensure ConveyThis is configured with allowed origins/domains and usage quotas so abuse from copied keys is limited. Rotate the key if it ever leaks beyond your app.

---

### 11. Mobile `+html.tsx` and `dangerouslySetInnerHTML`

**Location:** `mobile/app/+html.tsx`

**Issue:** A static CSS string is injected with `dangerouslySetInnerHTML`. The string is fixed in code (e.g. `responsiveBackground`), not user input, so risk is low.

**Recommendation:**

- No change required for security; consider a comment that the content is static and not user-controlled to avoid future misuse.

---

### 12. Environment and secrets

**Observation:** Secrets (Supabase service role, JWT secret, Twilio, 2factor, Groq, OpenAI) are read from environment variables, and `.env*` is gitignored. No hardcoded secrets were found in the scan.

**Recommendation:**

- Keep secrets only in env (or a secrets manager). Ensure production and CI do not log or expose env values. Use different keys for staging vs production.

---

## Positive findings

- **Database access:** Supabase client is used with parameterized queries; no raw SQL concatenation with user input was found. RLS is used in migrations for storage and profiles.
- **Auth pattern:** Most sensitive API routes (profile, care-circle, vault, notifications, health-profile) use a consistent auth pattern (Bearer or cookie + Supabase `getUser`).
- **Vault and care-circle:** Vault access is gated by `getAuthorizedVaultAccess` (link + requester/recipient/role). File type, size, and path validation are present for uploads.
- **OTP:** Phone numbers are normalized and validated; 2factor.in is used for OTP; custom JWT uses HMAC-SHA256 and server-side secret.
- **Remember-device:** Cookie is httpOnly, secure in production, sameSite lax; JWT verification uses a server-side secret and timing-safe compare where applicable.

---

## Summary table

| Severity  | Item                                      | Location / area              |
|-----------|-------------------------------------------|-------------------------------|
| Critical  | Medical API IDOR (no auth/authz)          | `/api/medical`                |
| Critical  | SOS API unauthenticated                   | `/api/sos`                    |
| High      | Chat API unauthenticated                  | `/api/chat`                   |
| High      | Error messages leaked to client           | Multiple API routes           |
| High      | Medical summary XSS risk                  | `MedicalSummaryModal.tsx`     |
| Medium    | No rate limiting                          | App-wide                     |
| Medium    | No security headers                       | `next.config.ts`              |
| Medium    | CORS wildcard subdomain                   | Flask `app_api.py`            |
| Low       | Duplicated auth logic                     | Multiple route files          |
| Low       | Client-exposed ConveyThis key             | ConveyThisProvider            |

Addressing the Critical and High items first will materially improve security; the rest will harden the application and operations.
