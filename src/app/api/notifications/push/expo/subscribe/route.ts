// Persist an Expo Push token from the mobile app. Called once after the user
// grants notification permission, plus on every cold start (Expo can rotate
// tokens). Re-calling with the same token is idempotent — the upsert refreshes
// `last_seen_at` and clears any prior invalidation flag.

import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { upsertExpoPushEndpoint } from '@/lib/notifications/repository';
import { triggerOpportunisticDrain } from '@/lib/notifications/opportunisticDrain';
import type { ExpoPushSubscriptionPayload } from '@/lib/notifications/types';

const EXPO_TOKEN_RE = /^ExponentPushToken\[[A-Za-z0-9_\-]+\]$/;

const isExpoToken = (v: unknown): v is string =>
  typeof v === 'string' && EXPO_TOKEN_RE.test(v);

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const expoPushToken = body?.expoPushToken;
    const deviceId = body?.deviceId;
    const platform = typeof body?.platform === 'string' ? body.platform : null;
    const appVersion = typeof body?.appVersion === 'string' ? body.appVersion : null;

    if (!isExpoToken(expoPushToken)) {
      return NextResponse.json(
        { message: 'expoPushToken must be in the form ExponentPushToken[...].' },
        { status: 400 }
      );
    }
    if (typeof deviceId !== 'string' || !deviceId.trim()) {
      return NextResponse.json({ message: 'deviceId is required.' }, { status: 400 });
    }

    const subscription: ExpoPushSubscriptionPayload = {
      expoPushToken,
      deviceId: deviceId.trim(),
      appVersion,
    };

    const adminClient = createSupabaseAdminClient();
    triggerOpportunisticDrain(adminClient);
    const endpoint = await upsertExpoPushEndpoint(adminClient, user.id, subscription, {
      platform,
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({
      endpoint: { id: endpoint.id, channel: endpoint.channel, last_seen_at: endpoint.last_seen_at },
    });
  } catch (error) {
    console.error('[notifications/push/expo/subscribe] error:', error);
    return NextResponse.json({ message: 'Failed to register expo push endpoint.' }, { status: 500 });
  }
}
