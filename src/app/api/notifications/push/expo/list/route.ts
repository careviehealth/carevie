// Returns the user's currently active Expo Push endpoints. Used by the mobile
// settings screen to render a "registered devices" list with per-device
// revocation. We never return the raw token to the client — just the metadata
// the user needs to recognize each device.

import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { listActiveEndpointsForUser } from '@/lib/notifications/repository';
import type { ExpoPushSubscriptionPayload } from '@/lib/notifications/types';

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createSupabaseAdminClient();
    const rows = await listActiveEndpointsForUser(adminClient, user.id, 'expo');

    const endpoints = rows.map((row) => {
      const sub = row.subscription as Partial<ExpoPushSubscriptionPayload> | null;
      // Echo the token back so the client can call /unsubscribe (which is keyed
      // by token, not endpoint id, to stay symmetric with how the device first
      // registered itself).
      return {
        id: row.id,
        platform: row.platform,
        appVersion: sub?.appVersion ?? null,
        deviceId: sub?.deviceId ?? null,
        expoPushToken: sub?.expoPushToken ?? null,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({ endpoints });
  } catch (error) {
    console.error('[notifications/push/expo/list] error:', error);
    return NextResponse.json({ message: 'Failed to list expo push endpoints.' }, { status: 500 });
  }
}
