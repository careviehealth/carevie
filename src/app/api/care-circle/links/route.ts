import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const getDisplayName = (displayName: string | null, phone: string | null) => {
  const trimmed = displayName?.trim() ?? '';
  if (trimmed) {
    return trimmed;
  }
  const phoneValue = phone?.trim() ?? '';
  return phoneValue || 'Unknown member';
};

type LinkStatus = 'pending' | 'accepted' | 'declined';

type LinkRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: LinkStatus;
  relationship: string | null;
  created_at: string;
  updated_at: string | null;
  profile_id: string | null;
};

type ProfileLookupRow = {
  id: string;
  display_name: string | null;
  name: string | null;
  phone: string | null;
  is_primary: boolean | null;
  created_at: string | null;
};

type CareCircleRole = 'family' | 'friend';

const parseDate = (value: string | null) => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
};

const pickPreferredProfile = (profiles: ProfileLookupRow[]) =>
  [...profiles].sort((a, b) => {
    const primaryDiff = Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary));
    if (primaryDiff !== 0) return primaryDiff;
    return parseDate(a.created_at) - parseDate(b.created_at);
  })[0] ?? null;

const sortLinksByOwnerProfilePriority = (
  links: LinkRow[],
  profilesById: Map<string, ProfileLookupRow>
) =>
  [...links].sort((a, b) => {
    const aPrimary = Number(Boolean(a.profile_id && profilesById.get(a.profile_id)?.is_primary));
    const bPrimary = Number(Boolean(b.profile_id && profilesById.get(b.profile_id)?.is_primary));
    if (aPrimary !== bPrimary) return bPrimary - aPrimary;
    return parseDate(a.created_at) - parseDate(b.created_at);
  });

const pickPrimaryOwnerProfileLink = (
  links: LinkRow[],
  profilesById: Map<string, ProfileLookupRow>
) => sortLinksByOwnerProfilePriority(links, profilesById)[0] ?? null;

const normalizeCareCircleRole = (value: string | null | undefined): CareCircleRole => {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (normalized === 'family') return 'family';
  return 'friend';
};

const groupLinksByPair = (links: LinkRow[]) => {
  const byPair = new Map<string, LinkRow[]>();
  links.forEach((link) => {
    const key = `${link.requester_id}:${link.recipient_id}`;
    const rows = byPair.get(key) ?? [];
    rows.push(link);
    byPair.set(key, rows);
  });
  return byPair;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedProfileId = url.searchParams.get('profileId')?.trim() || null;

  // Check for Bearer token in Authorization header (for mobile apps)
  const authHeader = request.headers.get('authorization');
  let user: { id: string } | null = null;

  if (authHeader?.startsWith('Bearer ')) {
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
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (!authError && authUser) {
      user = authUser;
    }
  } else {
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

    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();
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

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
    }
  );

  if (requestedProfileId) {
    let ownsRequestedProfile = false;

    const { data: ownedByAuth, error: ownedByAuthError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', requestedProfileId)
      .eq('auth_id', user.id)
      .maybeSingle();

    if (!ownedByAuthError && ownedByAuth?.id) {
      ownsRequestedProfile = true;
    }

    if (!ownsRequestedProfile) {
      const { data: ownedByUser, error: ownedByUserError } = await adminClient
        .from('profiles')
        .select('id')
        .eq('id', requestedProfileId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (ownedByUserError && ownedByUserError.code !== 'PGRST116') {
        return NextResponse.json({ message: ownedByUserError.message }, { status: 500 });
      }

      if (ownedByUser?.id) {
        ownsRequestedProfile = true;
      }
    }

    if (!ownsRequestedProfile) {
      return NextResponse.json({ message: 'Invalid profile selection.' }, { status: 403 });
    }
  }

  let outgoingQuery = adminClient
    .from('care_circle_links')
    .select('id, requester_id, recipient_id, status, relationship, created_at, updated_at, profile_id')
    .eq('requester_id', user.id);

  if (requestedProfileId) {
    outgoingQuery = outgoingQuery.eq('profile_id', requestedProfileId);
  }

  const incomingQuery = adminClient
    .from('care_circle_links')
    .select('id, requester_id, recipient_id, status, relationship, created_at, updated_at, profile_id')
    .eq('recipient_id', user.id);

  const [{ data: outgoingLinks, error: outgoingError }, { data: incomingLinks, error: incomingError }] =
    await Promise.all([outgoingQuery, incomingQuery]);

  if (outgoingError || incomingError) {
    return NextResponse.json({ message: outgoingError?.message || incomingError?.message }, { status: 500 });
  }

  const links = [...(outgoingLinks ?? []), ...(incomingLinks ?? [])] as LinkRow[];
  const memberIds = Array.from(
    new Set(
      links
        .flatMap((link) => [link.requester_id, link.recipient_id])
        .filter((id) => id && id !== user.id)
    )
  );

  const profilesByUserId = new Map<string, ProfileLookupRow[]>();
  const profilesById = new Map<string, ProfileLookupRow>();

  if (memberIds.length > 0) {
    const { data: memberProfilesByUser } = await adminClient
      .from('profiles')
      .select('id, user_id, display_name, name, phone, is_primary, created_at')
      .in('user_id', memberIds);

    (memberProfilesByUser ?? []).forEach((profile) => {
      const mapped: ProfileLookupRow = {
        id: profile.id,
        display_name: profile.display_name ?? null,
        name: profile.name ?? null,
        phone: profile.phone ?? null,
        is_primary: profile.is_primary ?? null,
        created_at: profile.created_at ?? null,
      };
      profilesById.set(profile.id, mapped);
      const userProfiles = profilesByUserId.get(profile.user_id) ?? [];
      userProfiles.push(mapped);
      profilesByUserId.set(profile.user_id, userProfiles);
    });

    const missingMemberIds = memberIds.filter((id) => !profilesByUserId.has(id));
    if (missingMemberIds.length > 0) {
      const { data: memberProfilesByAuth } = await adminClient
        .from('profiles')
        .select('id, auth_id, display_name, name, phone, is_primary, created_at')
        .in('auth_id', missingMemberIds);

      (memberProfilesByAuth ?? []).forEach((profile) => {
        const mapped: ProfileLookupRow = {
          id: profile.id,
          display_name: profile.display_name ?? null,
          name: profile.name ?? null,
          phone: profile.phone ?? null,
          is_primary: profile.is_primary ?? null,
          created_at: profile.created_at ?? null,
        };
        profilesById.set(profile.id, mapped);
        const userProfiles = profilesByUserId.get(profile.auth_id) ?? [];
        userProfiles.push(mapped);
        profilesByUserId.set(profile.auth_id, userProfiles);
      });
    }
  }

  const linkedProfileIds = Array.from(
    new Set(
      links
        .map((link) => link.profile_id)
        .filter((profileId): profileId is string => Boolean(profileId))
    )
  );
  const missingLinkedProfileIds = linkedProfileIds.filter((id) => !profilesById.has(id));

  if (missingLinkedProfileIds.length > 0) {
    const { data: linkedProfiles, error: linkedProfilesError } = await adminClient
      .from('profiles')
      .select('id, display_name, name, phone, is_primary, created_at')
      .in('id', missingLinkedProfileIds);

    if (linkedProfilesError) {
      return NextResponse.json({ message: linkedProfilesError.message }, { status: 500 });
    }

    (linkedProfiles ?? []).forEach((profile) => {
      profilesById.set(profile.id, {
        id: profile.id,
        display_name: profile.display_name ?? null,
        name: profile.name ?? null,
        phone: profile.phone ?? null,
        is_primary: profile.is_primary ?? null,
        created_at: profile.created_at ?? null,
      });
    });
  }

  const resolveDisplayName = (profile: ProfileLookupRow | null) =>
    profile?.display_name?.trim() ||
    profile?.name?.trim() ||
    getDisplayName(null, profile?.phone ?? null);

  const buildOutgoingRows = () => {
    const sourceRows = (outgoingLinks ?? []) as LinkRow[];
    const rows = requestedProfileId
      ? sourceRows
      : Array.from(groupLinksByPair(sourceRows).values())
          .map((pairRows) => pickPrimaryOwnerProfileLink(pairRows, profilesById))
          .filter((row): row is LinkRow => Boolean(row));

    return rows.map((link) => {
      const memberUserId = link.recipient_id;
      const memberProfile = pickPreferredProfile(profilesByUserId.get(memberUserId) ?? []);
      const ownerProfile = link.profile_id ? profilesById.get(link.profile_id) ?? null : null;

      return {
        id: link.id,
        memberId: memberUserId,
        memberProfileId: memberProfile?.id ?? null,
        profileId: link.profile_id,
        ownerProfileIsPrimary: Boolean(ownerProfile?.is_primary),
        status: link.status,
        role: normalizeCareCircleRole(link.relationship),
        displayName: resolveDisplayName(memberProfile),
        createdAt: link.created_at,
        updatedAt: link.updated_at,
      };
    });
  };

  const buildIncomingRows = () => {
    const groupedIncoming = groupLinksByPair((incomingLinks ?? []) as LinkRow[]);
    const shaped: LinkRow[] = [];

    groupedIncoming.forEach((pairRows) => {
      const acceptedRows = pairRows.filter((row) => row.status === 'accepted');
      const pendingRows = pairRows.filter((row) => row.status === 'pending');
      const declinedRows = pairRows.filter((row) => row.status === 'declined');

      if (acceptedRows.length > 0) {
        const representative = pickPrimaryOwnerProfileLink(acceptedRows, profilesById) ?? acceptedRows[0];
        const pairRole = normalizeCareCircleRole(representative?.relationship);
        if (pairRole === 'family') {
          shaped.push(...sortLinksByOwnerProfilePriority(acceptedRows, profilesById));
        } else {
          shaped.push(representative);
        }
        return;
      }

      if (pendingRows.length > 0) {
        shaped.push(pickPrimaryOwnerProfileLink(pendingRows, profilesById) ?? pendingRows[0]);
        return;
      }

      if (declinedRows.length > 0) {
        shaped.push(pickPrimaryOwnerProfileLink(declinedRows, profilesById) ?? declinedRows[0]);
      }
    });

    return shaped.map((link) => {
      const memberUserId = link.requester_id;
      const linkedProfile = link.profile_id ? profilesById.get(link.profile_id) ?? null : null;
      const fallbackProfile = pickPreferredProfile(profilesByUserId.get(memberUserId) ?? []);
      const memberProfile = linkedProfile ?? fallbackProfile;

      return {
        id: link.id,
        memberId: memberUserId,
        memberProfileId: memberProfile?.id ?? null,
        profileId: link.profile_id,
        ownerProfileIsPrimary: Boolean(linkedProfile?.is_primary),
        status: link.status,
        role: normalizeCareCircleRole(link.relationship),
        displayName: resolveDisplayName(memberProfile),
        createdAt: link.created_at,
        updatedAt: link.updated_at,
      };
    });
  };

  const outgoing = buildOutgoingRows();
  const incoming = buildIncomingRows();

  return NextResponse.json({ outgoing, incoming });
}
