import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth';

type LinkRow = {
  id: string;
  profile_id: string | null;
};

type ActivityRow = {
  id: string;
  profile_id: string;
  source: string;
  domain: 'vault' | 'medication' | 'appointment';
  action: 'upload' | 'rename' | 'delete' | 'add' | 'update';
  actor_user_id: string;
  actor_display_name: string | null;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type ProfileLabelRow = {
  id: string;
  display_name: string | null;
  name: string | null;
};

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

const parsePositiveInt = (value: string | null, fallback: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
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
    const limit = parsePositiveInt(url.searchParams.get('limit'), 30, 100);
    const sinceHours = parsePositiveInt(url.searchParams.get('sinceHours'), 24, 168);
    const cutoff = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();

    const { data: linkRows, error: linksError } = await adminClient
      .from('care_circle_links')
      .select('id, profile_id')
      .eq('recipient_id', user.id)
      .eq('status', 'accepted')
      .eq('relationship', 'family')
      .not('profile_id', 'is', null);

    if (linksError) {
      return NextResponse.json({ message: linksError.message }, { status: 500 });
    }

    const sharedProfileIds = Array.from(
      new Set(
        ((linkRows ?? []) as LinkRow[])
          .map((row) => row.profile_id)
          .filter((profileId): profileId is string => Boolean(profileId))
      )
    );
    const linkIdByProfileId = new Map<string, string>();
    ((linkRows ?? []) as LinkRow[]).forEach((row) => {
      if (!row.profile_id || !row.id || linkIdByProfileId.has(row.profile_id)) return;
      linkIdByProfileId.set(row.profile_id, row.id);
    });

    if (sharedProfileIds.length === 0) {
      return NextResponse.json({ logs: [] });
    }

    const { data: logRows, error: logsError } = await adminClient
      .from('profile_activity_logs')
      .select(
        'id, profile_id, source, domain, action, actor_user_id, actor_display_name, entity_id, entity_label, metadata, created_at'
      )
      .in('profile_id', sharedProfileIds)
      .eq('source', 'care_circle')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    if (logsError) {
      return NextResponse.json({ message: logsError.message }, { status: 500 });
    }

    const logs = (logRows ?? []) as ActivityRow[];
    if (logs.length === 0) {
      return NextResponse.json({ logs: [] });
    }

    const profileIds = Array.from(new Set(logs.map((row) => row.profile_id)));
    const { data: profileRows, error: profilesError } = await adminClient
      .from('profiles')
      .select('id, display_name, name')
      .in('id', profileIds);

    if (profilesError) {
      return NextResponse.json({ message: profilesError.message }, { status: 500 });
    }

    const profileNameById = new Map<string, string>();
    ((profileRows ?? []) as ProfileLabelRow[]).forEach((profile) => {
      const label = profile.display_name?.trim() || profile.name?.trim() || '';
      if (label) {
        profileNameById.set(profile.id, label);
      }
    });

    return NextResponse.json({
      logs: logs.map((log) => ({
        ...log,
        profile_label: profileNameById.get(log.profile_id) ?? null,
        link_id: linkIdByProfileId.get(log.profile_id) ?? null,
      })),
    });
  } catch (error) {
    console.error('Error fetching care circle activity feed:', error);
    return NextResponse.json({ message: 'Failed to fetch care circle activity.' }, { status: 500 });
  }
}
