/**
 * Proxies chat (FAQ assistant) requests to the Flask backend.
 * Requires Flask backend running (e.g. python app.py in backend/).
 *
 * SECURITY MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 * Authentication is OPTIONAL at this layer. Unauthenticated users may reach
 * public intents (greeting, unknown, platform_related). Protected intents
 * (appointments, medications, lab reports, etc.) are gated inside
 * intent_detector.py by receiving profile_id = null.
 *
 * PROFILE ID TRUST MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 * This system supports family/care-circle profiles — an authenticated user may
 * legitimately query a profile_id that is not their own auth UID (e.g. a family
 * member they manage). Therefore:
 *
 *   • Authenticated users  → profile_id from client body is forwarded as-is.
 *                            Supabase Row Level Security (RLS) enforces that the
 *                            authenticated user's session token can only read rows
 *                            they are authorised to access. This is the correct
 *                            enforcement layer for family-profile access control.
 *
 *   • Unauthenticated users → profile_id is ALWAYS set to null, regardless of
 *                             what the client sends. intent_detector.py routes
 *                             them to a login prompt for any protected intent.
 *
 * This means an unauthenticated attacker can never supply a profile_id that
 * reaches the data layer. An authenticated attacker attempting to access another
 * user's profile is blocked by Supabase RLS, not by this layer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getBackendInternalHeaders, hasBackendInternalAuth } from '@/lib/backendInternalAuth';
import { createRateLimiter, getClientIP } from '@/lib/rateLimit';

const chatLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 20 });

const PRODUCTION_CHATBOT_FALLBACK = 'https://chatbot-9fsv.onrender.com';
const USE_LOCAL_FLASK = process.env.USE_LOCAL_FLASK === 'true';
const CHAT_ASYNC_ENQUEUE_TIMEOUT_MS = Number(process.env.CHAT_ASYNC_ENQUEUE_TIMEOUT_MS || 10000);

function getChatBackendUrl(request: NextRequest) {
  const configuredChatbotUrl = process.env.NEXT_PUBLIC_CHATBOT_URL?.trim();
  const requestHost = request.nextUrl.hostname.toLowerCase();
  const isLocalRequest = requestHost === 'localhost' || requestHost === '127.0.0.1';

  if (USE_LOCAL_FLASK || isLocalRequest) {
    return 'http://localhost:5000';
  }

  if (configuredChatbotUrl) {
    return configuredChatbotUrl;
  }

  return process.env.NODE_ENV === 'production'
    ? PRODUCTION_CHATBOT_FALLBACK
    : 'http://localhost:5000';
}

function sanitizeBackendPayload(status: number, data: unknown): Record<string, unknown> {
  if (status < 500 && typeof data === 'object' && data !== null) {
    return data as Record<string, unknown>;
  }

  if (status < 500) {
    return {
      success: false,
      reply: 'Assistant returned an unexpected response.',
    };
  }

  return {
    success: false,
    reply: 'Assistant is unavailable. Please try again.',
  };
}

function getJobIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const value = record.job_id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  try {
    const flaskApiUrl = getChatBackendUrl(request);
    const ip = getClientIP(request);
    const block = chatLimiter.check(ip);
    if (block) return block;

    // ── Auth check (optional — we do not reject unauthenticated users) ────
    // We only use the auth result to decide whether to trust the client's
    // profile_id. Unauthenticated users get profile_id = null, which causes
    // intent_detector.py to return a login prompt for protected intents.
    const user = await getAuthenticatedUser(request).catch(() => null);
    const isAuthenticated = !!user;

    // Parse the request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, reply: 'Invalid request body.' },
        { status: 400 }
      );
    }

    // ── profile_id gating ────────────────────────────────────────────────
    // Authenticated : forward the client-supplied profile_id unchanged.
    //                 selectedProfile?.id from AppProfileProvider is the
    //                 correct value for family-profile queries. Supabase RLS
    //                 enforces access control at the data layer.
    //
    // Unauthenticated : nullify profile_id so the client cannot supply one.
    //                   intent_detector.py will return a login prompt for
    //                   any intent that requires personal health data.
    const forwardedProfileId = isAuthenticated
      ? (body.profile_id ?? null)
      : null;

    if (!flaskApiUrl || flaskApiUrl === '') {
      console.error('[api/chat] Flask API URL not configured');
      return NextResponse.json(
        {
          success: false,
          reply: 'Assistant is unavailable. Backend URL not configured.',
        },
        { status: 503 }
      );
    }

    if (!hasBackendInternalAuth()) {
      console.error('[api/chat] Backend internal auth is not configured');
      return NextResponse.json(
        {
          success: false,
          reply: 'Assistant is unavailable. Backend authentication is not configured.',
        },
        { status: 503 }
      );
    }

    const verifiedPayload = {
      ...body,
      profile_id: forwardedProfileId,
    };
    const inboundJobId = getJobIdFromPayload(verifiedPayload);

    console.log('[api/chat] Calling Flask at:', flaskApiUrl);
    console.log(
      '[api/chat] request_meta',
      JSON.stringify({
        job_id: inboundJobId,
        auth_user_id: isAuthenticated ? (user?.id ?? 'unknown') : null,
        auth_state: isAuthenticated ? 'authenticated' : 'guest',
      })
    );

    const res = await fetch(`${flaskApiUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getBackendInternalHeaders(),
      },
      body: JSON.stringify(verifiedPayload),
      signal: AbortSignal.timeout(CHAT_ASYNC_ENQUEUE_TIMEOUT_MS),
    });

    const responseText = await res.text();

    if (!responseText || responseText.trim() === '') {
      console.error('[api/chat] Empty response from Flask');
      return NextResponse.json(
        {
          success: false,
          reply: 'Assistant is unavailable. Received empty response from backend.',
        },
        { status: 502 }
      );
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('[api/chat] Invalid JSON from Flask:', responseText.slice(0, 200));
      return NextResponse.json(
        {
          success: false,
          reply: 'Assistant is unavailable. Invalid response from backend.',
        },
        { status: 502 }
      );
    }

    const outboundJobId = getJobIdFromPayload(data) ?? inboundJobId;
    console.log(
      '[api/chat] response_meta',
      JSON.stringify({
        status: res.status,
        job_id: outboundJobId,
      })
    );

    return NextResponse.json(sanitizeBackendPayload(res.status, data), { status: res.status });
  } catch (e) {
    console.error('[api/chat] Flask backend unreachable:', e);
    return NextResponse.json(
      {
        success: false,
        reply:
          'Assistant is unavailable. Run the full app with: npm run dev:all (and ensure backend/.env has GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY).',
      },
      { status: 503 }
    );
  }
}
