/*
 * app/api/share/[token]/route.ts
 *
 * SSE proxy: forwards the Flask /api/share/<token> stream to the browser.
 *
 * FIX (Problem 9 — Vercel SSE buffering):
 *   `export const dynamic = 'force-dynamic'` prevents Next.js from caching
 *   or pre-rendering this route.
 *
 *   `export const runtime = 'nodejs'` keeps the route on the Node.js runtime
 *   (not the Edge runtime).  The Node.js runtime with `force-dynamic` streams
 *   `res.body` (a Web ReadableStream) through without buffering when the
 *   response is constructed as `new NextResponse(res.body, ...)`.
 *
 *   Without these two exports Vercel's CDN layer may buffer the entire SSE
 *   response before forwarding it, which means the client receives nothing
 *   until all server-side generation is complete — destroying the progressive
 *   streaming behaviour.
 *
 * Note: `maxDuration` is set to 120 s.  Vercel Hobby / Pro plans cap
 * serverless function duration.  Adjust to match your plan limit if needed.
 * On self-hosted / Railway / Render deployments this has no effect.
 */

import { NextRequest, NextResponse } from 'next/server';

// ── FIX (Problem 9): Required for Vercel streaming ────────────────────────
export const dynamic    = 'force-dynamic';
export const runtime    = 'nodejs';
export const maxDuration = 120;   // seconds — increase if summaries take longer
// ─────────────────────────────────────────────────────────────────────────

function resolveBackendUrl(req: NextRequest): string {
  const hostname = req.nextUrl.hostname.toLowerCase();
  const isLocal  = hostname === 'localhost' || hostname === '127.0.0.1';

  if (isLocal) {
    return 'http://localhost:8000';
  }

  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    'http://localhost:8000'
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token }    = await params;
  const backendUrl   = resolveBackendUrl(req);

  try {
    const res = await fetch(`${backendUrl}/api/share/${token}`, {
      method:  'GET',
      headers: { Accept: 'text/event-stream' },
      // Tell Node's fetch not to accumulate the body — stream it directly.
      // (This is the default for Response bodies but being explicit is safer.)
    });

    // Non-2xx responses from Flask are JSON (404 / 410 / 500).
    // Forward them as-is so the frontend can show the right message.
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({
        error: `Backend returned ${res.status}`,
      }));
      return NextResponse.json(errorData, { status: res.status });
    }

    /*
     * Pipe the Flask ReadableStream directly to the client.
     *
     * NextResponse accepts a ReadableStream as its body and passes it through
     * without buffering — as long as `force-dynamic` and `runtime = 'nodejs'`
     * are set (see top of file).  Buffering with res.text() / JSON.parse()
     * would break SSE entirely.
     */
    return new NextResponse(res.body, {
      status:  200,
      headers: {
        'Content-Type':      'text/event-stream',
        'Cache-Control':     'no-cache, no-store, no-transform',
        'Connection':        'keep-alive',
        // Disable Nginx / proxy buffering at the infrastructure level as well
        'X-Accel-Buffering': 'no',
      },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Backend unreachable';
    return NextResponse.json(
      { error: `Backend connection failed: ${message}` },
      { status: 502 }
    );
  }
}