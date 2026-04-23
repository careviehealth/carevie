// State transitions for canonical user_notifications rows: read/dismissed/
// acknowledged/snoozed. Distinct from /api/notifications/state, which is the
// legacy text-id-based state route still used by the un-refactored panel.

import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { transitionNotificationState } from '@/lib/notifications/repository';

type Body = {
  read?: unknown;
  dismissed?: unknown;
  acknowledged?: unknown;
  snoozedUntil?: unknown;
};

const isIsoOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ message: 'Notification id is required.' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ message: 'Invalid body.' }, { status: 400 });
    }

    const transition: Parameters<typeof transitionNotificationState>[3] = {};
    if (typeof body.read === 'boolean') transition.read = body.read;
    if (typeof body.dismissed === 'boolean') transition.dismissed = body.dismissed;
    if (typeof body.acknowledged === 'boolean') transition.acknowledged = body.acknowledged;
    if (body.snoozedUntil !== undefined) {
      if (!isIsoOrNull(body.snoozedUntil)) {
        return NextResponse.json({ message: 'snoozedUntil must be ISO string or null.' }, { status: 400 });
      }
      transition.snoozedUntil = body.snoozedUntil;
    }

    if (Object.keys(transition).length === 0) {
      return NextResponse.json(
        { message: 'At least one of read/dismissed/acknowledged/snoozedUntil is required.' },
        { status: 400 }
      );
    }

    const adminClient = createSupabaseAdminClient();
    const row = await transitionNotificationState(adminClient, user.id, id, transition);
    if (!row) {
      return NextResponse.json({ message: 'Notification not found.' }, { status: 404 });
    }
    return NextResponse.json({ notification: row });
  } catch (error) {
    console.error('[notifications/:id/state] error:', error);
    return NextResponse.json({ message: 'Failed to update notification state.' }, { status: 500 });
  }
}
