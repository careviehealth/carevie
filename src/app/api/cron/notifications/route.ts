// Vercel Cron entry point. Drains the notification_jobs queue:
//   * `materialize_reminder` jobs become canonical user_notifications rows +
//     fanned-out `deliver_push` jobs.
//   * `deliver_push` jobs call the web-push provider and record outcomes.
//
// Auth model: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Manual
// invocations from a privileged operator can use the same header. Without the
// secret configured we still allow runs from localhost for local development.

import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { drainNotificationJobs } from '@/lib/notifications/jobRunner';

const isAuthorized = (request: Request): boolean => {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (expected) {
    return auth === `Bearer ${expected}`;
  }
  // Local-dev fallback: only allow if the request came from localhost.
  const host = request.headers.get('host') ?? '';
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
};

const handle = async (request: Request) => {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  try {
    const adminClient = createSupabaseAdminClient();
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get('limit') ?? '');
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50;
    const workerId = `cron-${process.env.VERCEL_REGION ?? 'local'}-${Date.now().toString(36)}`;
    const result = await drainNotificationJobs(adminClient, { workerId, limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[cron/notifications] error:', error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'cron failed' },
      { status: 500 }
    );
  }
};

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
