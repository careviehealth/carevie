import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const VAULT_FOLDERS = ['reports', 'prescriptions', 'insurance', 'bills'] as const;
type VaultFolder = (typeof VAULT_FOLDERS)[number];

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
    const profileIdParam = url.searchParams.get('profileId')?.trim() ?? '';
    const folder = url.searchParams.get('folder') as VaultFolder | null;
    const name = url.searchParams.get('name');

    if (!folder || !name) {
      return NextResponse.json({ message: 'Missing required parameters.' }, { status: 400 });
    }

    if (!VAULT_FOLDERS.includes(folder)) {
      return NextResponse.json({ message: 'Invalid folder.' }, { status: 400 });
    }

    const queryOwnedProfileById = async (column: 'auth_id' | 'user_id', profileId: string) =>
      supabase
        .from('profiles')
        .select('id')
        .eq('id', profileId)
        .eq(column, session.user.id)
        .maybeSingle();

    const queryPreferredProfile = async (column: 'auth_id' | 'user_id') =>
      supabase
        .from('profiles')
        .select('id')
        .eq(column, session.user.id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    let storageOwnerId = profileIdParam;
    if (storageOwnerId) {
      const ownedByAuth = await queryOwnedProfileById('auth_id', storageOwnerId);
      const missingAuthColumn =
        ownedByAuth.error?.code === 'PGRST204' ||
        ownedByAuth.error?.message?.toLowerCase().includes('auth_id');

      const ownedProfile =
        ownedByAuth.data ??
        (missingAuthColumn ? (await queryOwnedProfileById('user_id', storageOwnerId)).data : null);

      if (!ownedProfile?.id) {
        return NextResponse.json({ message: 'Profile not found.' }, { status: 404 });
      }
    } else {
      const preferredByAuth = await queryPreferredProfile('auth_id');
      const missingAuthColumn =
        preferredByAuth.error?.code === 'PGRST204' ||
        preferredByAuth.error?.message?.toLowerCase().includes('auth_id');

      const preferredProfile =
        preferredByAuth.data ??
        (missingAuthColumn ? (await queryPreferredProfile('user_id')).data : null);

      if (!preferredProfile?.id) {
        return NextResponse.json({ message: 'Profile not found.' }, { status: 404 });
      }

      storageOwnerId = preferredProfile.id;
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

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
