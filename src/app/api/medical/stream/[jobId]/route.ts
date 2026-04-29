import { NextRequest, NextResponse } from 'next/server';
import { getBackendInternalHeaders, hasBackendInternalAuth } from '@/lib/backendInternalAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

const PRODUCTION_BACKEND_FALLBACK = 'https://carevie.onrender.com';
const USE_LOCAL_FLASK = process.env.USE_LOCAL_FLASK === 'true';

function getMedicalBackendUrl(request: NextRequest) {
  const configuredBackendUrl =
    process.env.BACKEND_URL?.trim() || process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  const requestHost = request.nextUrl.hostname.toLowerCase();
  const isLocalRequest = requestHost === 'localhost' || requestHost === '127.0.0.1';

  if (USE_LOCAL_FLASK || isLocalRequest) {
    return 'http://localhost:8000';
  }

  if (configuredBackendUrl) {
    return configuredBackendUrl.replace(/\/+$/, '');
  }

  return process.env.NODE_ENV === 'production'
    ? PRODUCTION_BACKEND_FALLBACK
    : 'http://localhost:8000';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  if (!jobId?.trim()) {
    return NextResponse.json({ success: false, error: 'job_id is required.' }, { status: 400 });
  }

  const flaskApiUrl = getMedicalBackendUrl(request);
  if (!flaskApiUrl) {
    return NextResponse.json(
      { success: false, error: 'Medical summary stream is unavailable. Backend URL not configured.' },
      { status: 503 }
    );
  }

  if (!hasBackendInternalAuth()) {
    return NextResponse.json(
      {
        success: false,
        error: 'Medical summary stream is unavailable. Backend authentication is not configured.',
      },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(`${flaskApiUrl}/api/summary/stream/${encodeURIComponent(jobId)}`, {
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
      return NextResponse.json(errorPayload, { status: res.status });
    }

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
    return NextResponse.json(
      { success: false, error: `Medical summary stream connection failed: ${message}` },
      { status: 502 }
    );
  }
}
