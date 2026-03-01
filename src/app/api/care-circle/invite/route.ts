import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

type InvitePayload = {
  contact?: string;
  profileId?: string;
};

type ProfileRow = {
  id: string;
  is_primary?: boolean | null;
};

type RecipientLookupRow = {
  auth_id?: string | null;
  user_id?: string | null;
  is_primary?: boolean | null;
  created_at?: string | null;
};

const normalizeContact = (value: string) => value.replace(/[^\d+]/g, '');
const isMissingColumnError = (
  error: { code?: string; message?: string } | null | undefined,
  column: string
) =>
  error?.code === 'PGRST204' ||
  error?.message?.toLowerCase().includes(column.toLowerCase()) ||
  false;
const isDuplicateKeyError = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === '23505' || /duplicate key/i.test(error?.message ?? '');

/** Normalize to E.164: if already has + use it, else assume India for 10 digits. */
const normalizeContactToE164 = (value: string): string => {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.startsWith('91') && digits.length === 12) {
    return `+${digits}`;
  }
  return digits ? `+${digits}` : trimmed;
};

export async function POST(request: Request) {
  // Check for Bearer token in Authorization header (for mobile apps)
  const authHeader = request.headers.get('authorization');
  let user: { id: string } | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    // Mobile app authentication via Bearer token
    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (!authError && authUser) {
      user = authUser;
    }
  } else {
    // Web app authentication via cookies
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
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (!authError && authUser) {
      user = authUser;
    }
  }

  if (!user) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { message: 'Service role key is missing.' },
      { status: 500 }
    );
  }

  let payload: InvitePayload;
  try {
    payload = (await request.json()) as InvitePayload;
  } catch {
    return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
  }

  const contact = payload.contact?.trim();
  const requestedProfileId = payload.profileId?.trim();

  if (!contact) {
    return NextResponse.json({ message: 'Contact is required.' }, { status: 400 });
  }
  if (!requestedProfileId) {
    return NextResponse.json({ message: 'profileId is required.' }, { status: 400 });
  }
  if (contact.includes('@')) {
    return NextResponse.json(
      { message: 'Email invites are not supported. Use a phone number instead.' },
      { status: 400 }
    );
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
    }
  );

  // Enforce inviter-owned primary profile for invite creation.
  let selectedProfile: ProfileRow | null = null;
  const ownedByAuth = await adminClient
    .from('profiles')
    .select('id, is_primary')
    .eq('id', requestedProfileId)
    .eq('auth_id', user.id)
    .maybeSingle();

  if (ownedByAuth.error && !isMissingColumnError(ownedByAuth.error, 'auth_id') && ownedByAuth.error.code !== 'PGRST116') {
    return NextResponse.json({ message: ownedByAuth.error.message }, { status: 500 });
  }
  if (!ownedByAuth.error && ownedByAuth.data?.id) {
    selectedProfile = ownedByAuth.data as ProfileRow;
  }

  if (!selectedProfile) {
    const ownedByUser = await adminClient
      .from('profiles')
      .select('id, is_primary')
      .eq('id', requestedProfileId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (ownedByUser.error && ownedByUser.error.code !== 'PGRST116') {
      return NextResponse.json({ message: ownedByUser.error.message }, { status: 500 });
    }
    if (ownedByUser.data?.id) {
      selectedProfile = ownedByUser.data as ProfileRow;
    }
  }

  if (!selectedProfile?.id) {
    return NextResponse.json({ message: 'Invalid profile selection.' }, { status: 403 });
  }
  if (!selectedProfile.is_primary) {
    return NextResponse.json(
      { message: 'Only the primary profile can send care circle invites.' },
      { status: 403 }
    );
  }

  let recipientId: string | null = null;

  if (!recipientId) {
    const normalized = normalizeContact(contact);
    const withCountryCode = normalizeContactToE164(contact);
    const variants = new Set<string>();
    if (contact) variants.add(contact);
    if (normalized) variants.add(normalized);
    if (withCountryCode) variants.add(withCountryCode);
    if (normalized && !normalized.startsWith('+')) {
      variants.add(`+${normalized}`);
    }
    if (normalized.startsWith('+')) {
      variants.add(normalized.replace(/^\+/, ''));
    }

    const preferredProfilesLookup = await adminClient
      .from('profiles')
      .select('auth_id, user_id, is_primary, created_at')
      .in('phone', Array.from(variants))
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    const missingAuthColumn = isMissingColumnError(preferredProfilesLookup.error, 'auth_id');
    let profileRows: RecipientLookupRow[] | null = null;

    if (!preferredProfilesLookup.error) {
      profileRows = preferredProfilesLookup.data as RecipientLookupRow[];
    } else if (missingAuthColumn) {
      const legacyProfilesLookup = await adminClient
        .from('profiles')
        .select('user_id, is_primary, created_at')
        .in('phone', Array.from(variants))
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });
      if (legacyProfilesLookup.error) {
        return NextResponse.json(
          { message: legacyProfilesLookup.error.message },
          { status: 500 }
        );
      }
      profileRows = legacyProfilesLookup.data as RecipientLookupRow[];
    } else {
      return NextResponse.json(
        { message: preferredProfilesLookup.error.message },
        { status: 500 }
      );
    }

    const preferredProfile = profileRows?.[0] ?? null;
    recipientId = preferredProfile?.auth_id ?? preferredProfile?.user_id ?? null;
  }

  if (!recipientId) {
    return NextResponse.json(
      { message: 'No registered user found with that contact.' },
      { status: 404 }
    );
  }

  if (recipientId === user.id) {
    return NextResponse.json({ message: 'You cannot invite yourself.' }, { status: 400 });
  }

  const { data: existingPairRows, error: existingPairError } = await adminClient
    .from('care_circle_links')
    .select('id, status')
    .eq('requester_id', user.id)
    .eq('recipient_id', recipientId);

  if (existingPairError) {
    return NextResponse.json({ message: existingPairError.message }, { status: 500 });
  }

  const existingStatuses = new Set((existingPairRows ?? []).map((row) => row.status));
  if (existingStatuses.has('accepted')) {
    return NextResponse.json({ message: 'This member is already in your care circle.' }, { status: 409 });
  }
  if (existingStatuses.has('pending')) {
    return NextResponse.json({ message: 'An invite is already pending for this member.' }, { status: 409 });
  }

  const nowIso = new Date().toISOString();

  // Re-open previously declined/archived rows instead of creating new ones.
  if ((existingPairRows ?? []).length > 0) {
    const { error: reactivateError } = await adminClient
      .from('care_circle_links')
      .update({
        status: 'pending',
        relationship: 'friend',
        updated_at: nowIso,
      })
      .eq('requester_id', user.id)
      .eq('recipient_id', recipientId);

    if (reactivateError) {
      return NextResponse.json({ message: reactivateError.message }, { status: 500 });
    }

    return NextResponse.json({
      recipientId,
      invitedProfilesCount: existingPairRows.length,
      reactivatedExistingInvite: true,
    });
  }

  const inviterProfilesByAuth = await adminClient
    .from('profiles')
    .select('id')
    .eq('auth_id', user.id)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  let inviterProfiles: Array<{ id: string }> = [];

  if (!inviterProfilesByAuth.error && inviterProfilesByAuth.data?.length) {
    inviterProfiles = inviterProfilesByAuth.data;
  } else {
    if (inviterProfilesByAuth.error && !isMissingColumnError(inviterProfilesByAuth.error, 'auth_id')) {
      return NextResponse.json({ message: inviterProfilesByAuth.error.message }, { status: 500 });
    }
    const inviterProfilesByUser = await adminClient
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    if (inviterProfilesByUser.error) {
      return NextResponse.json({ message: inviterProfilesByUser.error.message }, { status: 500 });
    }
    inviterProfiles = inviterProfilesByUser.data ?? [];
  }

  if (inviterProfiles.length === 0) {
    return NextResponse.json({ message: 'No profile available for this account.' }, { status: 400 });
  }

  const inviteRows = inviterProfiles.map((profile) => ({
    requester_id: user.id,
    recipient_id: recipientId,
    profile_id: profile.id,
    status: 'pending' as const,
    relationship: 'friend',
    updated_at: nowIso,
  }));

  const { error: inviteError } = await adminClient
    .from('care_circle_links')
    .upsert(inviteRows, { onConflict: 'requester_id,recipient_id,profile_id' });

  if (inviteError) {
    if (isDuplicateKeyError(inviteError) && inviteRows.length > 1) {
      // Backward-compat fallback when legacy pair-level unique constraints still exist.
      const primaryInviteRow = inviteRows.find((row) => row.profile_id === selectedProfile.id) ?? inviteRows[0];
      const { error: fallbackInviteError } = await adminClient
        .from('care_circle_links')
        .upsert([primaryInviteRow], { onConflict: 'requester_id,recipient_id,profile_id' });

      if (!fallbackInviteError) {
        return NextResponse.json({
          recipientId,
          invitedProfilesCount: 1,
          usedLegacyFallback: true,
        });
      }
    }

    const message = isDuplicateKeyError(inviteError)
      ? 'An invite already exists for this member.'
      : inviteError.message;
    return NextResponse.json({ message }, { status: 409 });
  }

  return NextResponse.json({ recipientId, invitedProfilesCount: inviteRows.length });
}
