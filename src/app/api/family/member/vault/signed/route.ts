import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const FAMILY_FOLDERS = ['reports', 'prescriptions', 'insurance', 'bills'] as const;
type FamilyFolder = (typeof FAMILY_FOLDERS)[number];

type ProfileLookup = {
  id: string;
  user_id: string | null;
  auth_id?: string | null;
  is_primary: boolean | null;
  created_at: string | null;
};

const parseDate = (value: string | null) => {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
};

const pickPreferredProfile = (rows: ProfileLookup[]) =>
  [...rows].sort((a, b) => {
    const primaryDiff = Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary));
    if (primaryDiff !== 0) return primaryDiff;
    return parseDate(a.created_at) - parseDate(b.created_at);
  })[0] ?? null;

const isMissingAuthColumnError = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST204' || error?.message?.toLowerCase().includes('auth_id');

export async function GET(request: Request) {
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

    const url = new URL(request.url);
    const memberId = url.searchParams.get('memberId');
    const folder = url.searchParams.get('folder') as FamilyFolder | null;
    const name = url.searchParams.get('name');

    if (!memberId || !folder || !name) {
      return NextResponse.json({ message: 'Missing required parameters.' }, { status: 400 });
    }

    if (!FAMILY_FOLDERS.includes(folder)) {
      return NextResponse.json({ message: 'Invalid folder.' }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    let memberAccountId = memberId;
    let storageOwnerId = memberId;

    const { data: directProfileById, error: directProfileError } = await adminClient
      .from('profiles')
      .select('id, user_id, auth_id, is_primary, created_at')
      .eq('id', memberId)
      .maybeSingle();

    if (directProfileError && directProfileError.code !== 'PGRST116') {
      return NextResponse.json({ message: directProfileError.message }, { status: 500 });
    }

    if (directProfileById?.id) {
      storageOwnerId = directProfileById.id;
      memberAccountId = directProfileById.auth_id ?? directProfileById.user_id ?? memberId;
    } else {
      const preferredByAuth = await adminClient
        .from('profiles')
        .select('id, user_id, auth_id, is_primary, created_at')
        .eq('auth_id', memberId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(20);

      let candidateRows: ProfileLookup[] = [];

      if (!preferredByAuth.error) {
        candidateRows = (preferredByAuth.data ?? []) as ProfileLookup[];
      } else if (!isMissingAuthColumnError(preferredByAuth.error)) {
        return NextResponse.json({ message: preferredByAuth.error.message }, { status: 500 });
      }

      if (candidateRows.length === 0) {
        const preferredByUser = await adminClient
          .from('profiles')
          .select('id, user_id, auth_id, is_primary, created_at')
          .eq('user_id', memberId)
          .order('is_primary', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(20);

        if (preferredByUser.error && preferredByUser.error.code !== 'PGRST116') {
          return NextResponse.json({ message: preferredByUser.error.message }, { status: 500 });
        }

        candidateRows = (preferredByUser.data ?? []) as ProfileLookup[];
      }

      const preferred = pickPreferredProfile(candidateRows);
      if (preferred?.id) {
        storageOwnerId = preferred.id;
        memberAccountId = preferred.auth_id ?? preferred.user_id ?? memberId;
      }
    }

    const { data: viewerMember, error: viewerError } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (viewerError || !viewerMember?.family_id) {
      return NextResponse.json({ message: 'Not allowed for this family member.' }, { status: 403 });
    }

    const { data: targetMember, error: targetError } = await supabase
      .from('family_members')
      .select('family_id')
      .eq('user_id', memberAccountId)
      .eq('family_id', viewerMember.family_id)
      .maybeSingle();

    if (targetError || !targetMember) {
      return NextResponse.json({ message: 'Not allowed for this family member.' }, { status: 403 });
    }

    const path = `${storageOwnerId}/${folder}/${name}`;
    const { data, error } = await adminClient.storage
      .from('medical-vault')
      .createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ message: 'Unable to create signed URL.' }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error('Error creating vault signed url:', error);
    return NextResponse.json(
      { message: 'Failed to create signed url' },
      { status: 500 }
    );
  }
}
