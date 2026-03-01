import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

type LinkRow = {
  id: string;
  requester_id?: string;
  recipient_id?: string;
  status: string;
  created_at: string;
};

export async function GET() {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const { data: outgoingLinks, error: outgoingError } = await supabase
      .from('family_links')
      .select('id, recipient_id, status, created_at')
      .eq('requester_id', session.user.id);

    if (outgoingError) throw outgoingError;

    const { data: incomingLinks, error: incomingError } = await supabase
      .from('family_links')
      .select('id, requester_id, status, created_at')
      .eq('recipient_id', session.user.id);

    if (incomingError) throw incomingError;

    const { data: userFamilyLinks, error: userFamilyLinksError } = await supabase
      .from('family_links')
      .select('family_id, status')
      .or(`requester_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`);

    if (userFamilyLinksError) throw userFamilyLinksError;

    const acceptedFamilyLink = (userFamilyLinks || []).find((link) => link.status === 'accepted');
    const pendingFamilyLink = (userFamilyLinks || []).find((link) => link.status === 'pending');
    const familyId = acceptedFamilyLink?.family_id ?? pendingFamilyLink?.family_id ?? null;

    const { data: familyLinks, error: familyLinksError } = familyId
      ? await supabase
          .from('family_links')
          .select('requester_id, recipient_id, status')
          .eq('family_id', familyId)
          .eq('status', 'accepted')
      : { data: [], error: null };

    if (familyLinksError) throw familyLinksError;

    const memberIds = new Set<string>();
    memberIds.add(session.user.id);
    (familyLinks || []).forEach((link) => {
      if (link.requester_id) memberIds.add(link.requester_id);
      if (link.recipient_id) memberIds.add(link.recipient_id);
    });

    const displayIds = new Set<string>(memberIds);
    (outgoingLinks || []).forEach((link) => {
      if (link.recipient_id) displayIds.add(link.recipient_id);
    });
    (incomingLinks || []).forEach((link) => {
      if (link.requester_id) displayIds.add(link.requester_id);
    });

    const { data: profileRows } = await adminClient
      .from('profiles')
      .select('user_id, display_name, name, is_primary, created_at')
      .in('user_id', Array.from(displayIds));

    const parseDate = (value: string | null) => {
      if (!value) return Number.MAX_SAFE_INTEGER;
      const ts = Date.parse(value);
      return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
    };

    const profileRowsByUserId = new Map<
      string,
      Array<{ display_name: string | null; name: string | null; is_primary: boolean | null; created_at: string | null }>
    >();
    (profileRows || []).forEach((row) => {
      const existing = profileRowsByUserId.get(row.user_id) ?? [];
      existing.push({
        display_name: row.display_name ?? null,
        name: row.name ?? null,
        is_primary: row.is_primary ?? null,
        created_at: row.created_at ?? null,
      });
      profileRowsByUserId.set(row.user_id, existing);
    });

    const displayNameById = new Map<string, string>();
    profileRowsByUserId.forEach((rows, userId) => {
      const preferred = [...rows].sort((a, b) => {
        const primaryDiff = Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary));
        if (primaryDiff !== 0) return primaryDiff;
        return parseDate(a.created_at) - parseDate(b.created_at);
      })[0];
      displayNameById.set(userId, preferred?.display_name?.trim() || preferred?.name?.trim() || 'Unknown');
    });

    const outgoing = (outgoingLinks || []).map((link: LinkRow) => ({
      id: link.id,
      memberId: link.recipient_id || '',
      status: link.status,
      displayName: displayNameById.get(link.recipient_id || '') || 'Unknown',
      createdAt: link.created_at,
    }));

    const incoming = (incomingLinks || []).map((link: LinkRow) => ({
      id: link.id,
      memberId: link.requester_id || '',
      status: link.status,
      displayName: displayNameById.get(link.requester_id || '') || 'Unknown',
      createdAt: link.created_at,
    }));

    const familyMembers = Array.from(memberIds).map((id) => ({
      id,
      displayName: displayNameById.get(id) || 'Unknown',
    }));

    return NextResponse.json({
      familyMembers,
      outgoing,
      incoming,
    });
  } catch (error) {
    console.error('Error fetching family links:', error);
    return NextResponse.json({ message: 'Failed to fetch family links' }, { status: 500 });
  }
}
