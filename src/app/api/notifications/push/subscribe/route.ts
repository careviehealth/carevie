// Persist a browser PushSubscription. Called once per device after the user
// grants notification permission. Re-calling with the same endpoint refreshes
// `last_seen_at` and clears any prior invalidation flag (idempotent).

import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { upsertWebPushEndpoint } from '@/lib/notifications/repository';
import type { WebPushSubscriptionPayload } from '@/lib/notifications/types';

const isValidSubscription = (v: unknown): v is WebPushSubscriptionPayload => {
  if (!v || typeof v !== 'object') return false;
  const sub = v as Record<string, unknown>;
  if (typeof sub.endpoint !== 'string' || !sub.endpoint) return false;
  const keys = sub.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return false;
  return true;
};

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const subscription = body?.subscription;
    if (!isValidSubscription(subscription)) {
      return NextResponse.json(
        { message: 'subscription must include endpoint and keys (p256dh, auth).' },
        { status: 400 }
      );
    }

    const userAgent =
      typeof body?.userAgent === 'string'
        ? body.userAgent
        : request.headers.get('user-agent');
    const platform = typeof body?.platform === 'string' ? body.platform : null;

    const adminClient = createSupabaseAdminClient();
    const endpoint = await upsertWebPushEndpoint(adminClient, user.id, subscription, {
      userAgent,
      platform,
    });

    return NextResponse.json({
      endpoint: { id: endpoint.id, channel: endpoint.channel, last_seen_at: endpoint.last_seen_at },
    });
  } catch (error) {
    console.error('[notifications/push/subscribe] error:', error);
    return NextResponse.json({ message: 'Failed to register push endpoint.' }, { status: 500 });
  }
}
