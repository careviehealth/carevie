import { NextRequest, NextResponse } from 'next/server';
import { getBackendInternalHeaders, hasBackendInternalAuth } from '@/lib/backendInternalAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const PRODUCTION_CHATBOT_FALLBACK = 'https://chatbot-9fsv.onrender.com';
const USE_LOCAL_FLASK = process.env.USE_LOCAL_FLASK === 'true';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId?.trim()) {
    return NextResponse.json({ success: false, error: 'job_id is required.' }, { status: 400 });
  }

  const flaskApiUrl = getChatBackendUrl(request);
  if (!flaskApiUrl || flaskApiUrl === '') {
    return NextResponse.json(
      { success: false, error: 'Assistant stream is unavailable. Backend URL not configured.' },
      { status: 503 }
    );
  }

  if (!hasBackendInternalAuth()) {
    return NextResponse.json(
      { success: false, error: 'Assistant stream is unavailable. Backend authentication is not configured.' },
      { status: 503 }
    );
  }

  console.log(
    '[api/chat/stream] request_meta',
    JSON.stringify({
      job_id: jobId,
      method: 'GET',
    })
  );

  try {
    const res = await fetch(`${flaskApiUrl}/api/chat/stream/${encodeURIComponent(jobId)}`, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...getBackendInternalHeaders(),
      },
    });

    if (!res.ok) {
      const errorPayload = await res.json().catch(() => ({
        success: false,
        error: `Backend returned ${res.status}`,
      }));
      console.warn(
        '[api/chat/stream] upstream_error',
        JSON.stringify({
          job_id: jobId,
          status: res.status,
        })
      );
      return NextResponse.json(errorPayload, { status: res.status });
    }

    console.log(
      '[api/chat/stream] stream_opened',
      JSON.stringify({
        job_id: jobId,
        status: 200,
      })
    );

    return new NextResponse(res.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Backend stream unreachable';
    console.error(
      '[api/chat/stream] stream_failure',
      JSON.stringify({
        job_id: jobId,
        message,
      })
    );
    return NextResponse.json(
      { success: false, error: `Assistant stream connection failed: ${message}` },
      { status: 502 }
    );
  }
}
