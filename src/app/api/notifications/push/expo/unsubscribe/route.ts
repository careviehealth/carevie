// Disable an Expo Push token (e.g. user signed out, or toggled mobile push off
// in settings). Row stays in the table for audit history; we just stop
// targeting it.

import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { removeExpoPushEndpointByToken } from '@/lib/notifications/repository';

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { expoPushToken?: unknown } | null;
    const token = typeof body?.expoPushToken === 'string' ? body.expoPushToken : '';
    if (!token) {
      return NextResponse.json({ message: 'expoPushToken is required.' }, { status: 400 });
    }

    const adminClient = createSupabaseAdminClient();
    const removed = await removeExpoPushEndpointByToken(adminClient, user.id, token);
    return NextResponse.json({ removed });
  } catch (error) {
    console.error('[notifications/push/expo/unsubscribe] error:', error);
    return NextResponse.json({ message: 'Failed to unregister expo push endpoint.' }, { status: 500 });
  }
}
