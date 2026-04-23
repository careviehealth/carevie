// Returns the VAPID public key the browser needs to call PushManager.subscribe.
// This key is meant to be public; we still gate it on auth so unauthenticated
// callers can't fingerprint our deployment.

import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { getPublicVapidKey } from '@/lib/notifications/push';

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const key = getPublicVapidKey();
  if (!key) {
    return NextResponse.json(
      { message: 'Push is not configured on this deployment.' },
      { status: 503 }
    );
  }
  return NextResponse.json({ publicKey: key });
}
