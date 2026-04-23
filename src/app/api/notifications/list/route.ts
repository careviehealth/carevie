// Canonical notification feed for the in-app bell panel. Cursor-paginated by
// (scheduled_for, id) so newer events surface first and pagination is stable
// across writes.

import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { listNotificationsForUser } from '@/lib/notifications/repository';
import { isNotificationCategory, type NotificationCategory } from '@/lib/notifications/types';

const parseCategories = (raw: string | null): NotificationCategory[] | undefined => {
  if (!raw) return undefined;
  const items = raw
    .split(',')
    .map((s) => s.trim())
    .filter(isNotificationCategory);
  return items.length ? items : undefined;
};

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get('limit') ?? '');
    const limit = Number.isFinite(limitParam) ? limitParam : undefined;
    const cursor = url.searchParams.get('cursor');
    const includeDismissed = url.searchParams.get('includeDismissed') === '1';

    const adminClient = createSupabaseAdminClient();
    const { rows, nextCursor } = await listNotificationsForUser(adminClient, user.id, {
      limit,
      cursorScheduledFor: cursor ?? undefined,
      includeDismissed,
      categories: parseCategories(url.searchParams.get('categories')),
    });

    return NextResponse.json({
      notifications: rows,
      nextCursor: nextCursor ? nextCursor.scheduledFor : null,
    });
  } catch (error) {
    console.error('[notifications/list] error:', error);
    return NextResponse.json({ message: 'Failed to load notifications.' }, { status: 500 });
  }
}
