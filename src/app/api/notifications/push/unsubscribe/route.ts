// Mark this browser's push endpoint as disabled. The row stays in the table
// for audit history; we just stop targeting it. The browser is expected to
// also call PushSubscription.unsubscribe() locally.

import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { removeEndpointBySubscriptionEndpoint } from '@/lib/notifications/repository';

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
    if (!endpoint) {
      return NextResponse.json({ message: 'endpoint is required.' }, { status: 400 });
    }

    const adminClient = createSupabaseAdminClient();
    const removed = await removeEndpointBySubscriptionEndpoint(adminClient, user.id, endpoint);
    return NextResponse.json({ removed });
  } catch (error) {
    console.error('[notifications/push/unsubscribe] error:', error);
    return NextResponse.json({ message: 'Failed to unregister push endpoint.' }, { status: 500 });
  }
}
