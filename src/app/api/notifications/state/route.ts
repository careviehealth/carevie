import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth';

type NotificationStateRow = {
  notification_id: string;
  read_at: string | null;
  dismissed_at: string | null;
  updated_at: string;
};

type UpdateNotificationStatePayload = {
  notificationIds?: unknown;
  dismissed?: unknown;
  read?: unknown;
};

const MAX_NOTIFICATION_IDS = 200;

const createAdminClient = () => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
};

const normalizeNotificationIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const unique = new Set<string>();
  value.forEach((entry) => {
    if (typeof entry !== 'string') return;
    const trimmed = entry.trim();
    if (!trimmed) return;
    unique.add(trimmed);
  });
  return Array.from(unique).slice(0, MAX_NOTIFICATION_IDS);
};

const parseIdsFromSearch = (rawIds: string | null): string[] => {
  if (!rawIds) return [];
  const unique = new Set<string>();
  rawIds
    .split(',')
    .map((entry) => {
      try {
        return decodeURIComponent(entry).trim();
      } catch {
        return entry.trim();
      }
    })
    .forEach((entry) => {
      if (!entry) return;
      unique.add(entry);
    });
  return Array.from(unique).slice(0, MAX_NOTIFICATION_IDS);
};

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    const url = new URL(request.url);
    const notificationIds = parseIdsFromSearch(url.searchParams.get('ids'));
    if (notificationIds.length === 0) {
      return NextResponse.json({ states: [] satisfies NotificationStateRow[] });
    }

    const { data, error } = await adminClient
      .from('notification_states')
      .select('notification_id, read_at, dismissed_at, updated_at')
      .eq('user_id', user.id)
      .in('notification_id', notificationIds);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ states: (data ?? []) as NotificationStateRow[] });
  } catch (error) {
    console.error('Error loading notification state:', error);
    return NextResponse.json({ message: 'Failed to load notification state.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    const body = (await request.json().catch(() => null)) as UpdateNotificationStatePayload | null;
    const notificationIds = normalizeNotificationIds(body?.notificationIds);
    if (notificationIds.length === 0) {
      return NextResponse.json({ message: 'notificationIds is required.' }, { status: 400 });
    }

    const hasDismissedValue = typeof body?.dismissed === 'boolean';
    const hasReadValue = typeof body?.read === 'boolean';
    if (!hasDismissedValue && !hasReadValue) {
      return NextResponse.json(
        { message: 'At least one of dismissed/read must be provided.' },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    const rows = notificationIds.map((notificationId) => {
      const nextRow: Record<string, unknown> = {
        user_id: user.id,
        notification_id: notificationId,
        updated_at: nowIso,
      };
      if (hasDismissedValue) {
        nextRow.dismissed_at = body?.dismissed ? nowIso : null;
      }
      if (hasReadValue) {
        nextRow.read_at = body?.read ? nowIso : null;
      }
      return nextRow;
    });

    const { error } = await adminClient
      .from('notification_states')
      .upsert(rows, { onConflict: 'user_id,notification_id' });

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating notification state:', error);
    return NextResponse.json({ message: 'Failed to update notification state.' }, { status: 500 });
  }
}
