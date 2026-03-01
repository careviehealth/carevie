import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

type CareCircleRole = 'family' | 'friend';

type RolePayload = {
  linkId?: string;
  role?: string;
};

type LinkRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined';
  relationship: string | null;
  profile_id: string | null;
};

const normalizeRoleInput = (value: string | null | undefined): CareCircleRole | null => {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');

  if (normalized === 'family') return 'family';
  if (normalized === 'friend') return 'friend';

  return null;
};

const isMissingColumnError = (
  error: { code?: string; message?: string } | null | undefined,
  column: string
) =>
  error?.code === 'PGRST204' ||
  error?.message?.toLowerCase().includes(column.toLowerCase()) ||
  false;

const getAuthenticatedUser = async (request: Request) => {
  const authHeader = request.headers.get('authorization');

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
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (!error && user) {
      return user;
    }

    return null;
  }

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
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!error && user) {
    return user;
  }

  return null;
};

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    let payload: RolePayload;
    try {
      payload = (await request.json()) as RolePayload;
    } catch {
      return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
    }

    const linkId = payload.linkId?.trim();
    const nextRole = normalizeRoleInput(payload.role);

    if (!linkId) {
      return NextResponse.json({ message: 'linkId is required.' }, { status: 400 });
    }

    if (!nextRole) {
      return NextResponse.json(
        { message: 'Invalid role. Use family or friend.' },
        { status: 400 }
      );
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const { data: linkRow, error: linkError } = await adminClient
      .from('care_circle_links')
      .select('id, requester_id, recipient_id, status, relationship, profile_id')
      .eq('id', linkId)
      .maybeSingle();

    if (linkError && linkError.code !== 'PGRST116') {
      return NextResponse.json({ message: linkError.message }, { status: 500 });
    }

    const link = linkRow as LinkRow | null;

    if (!link) {
      return NextResponse.json({ message: 'Care circle link not found.' }, { status: 404 });
    }

    if (link.requester_id !== user.id) {
      return NextResponse.json(
        { message: 'Only the care circle owner can update roles.' },
        { status: 403 }
      );
    }

    if (!link.profile_id) {
      return NextResponse.json(
        { message: 'Invalid care circle link profile.' },
        { status: 400 }
      );
    }

    const primaryByAuth = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', link.profile_id)
      .eq('is_primary', true)
      .eq('auth_id', user.id)
      .maybeSingle();

    let isPrimaryLink = false;
    if (!primaryByAuth.error && primaryByAuth.data?.id) {
      isPrimaryLink = true;
    }
    if (primaryByAuth.error && !isMissingColumnError(primaryByAuth.error, 'auth_id') && primaryByAuth.error.code !== 'PGRST116') {
      return NextResponse.json({ message: primaryByAuth.error.message }, { status: 500 });
    }

    if (!isPrimaryLink) {
      const primaryByUser = await adminClient
        .from('profiles')
        .select('id')
        .eq('id', link.profile_id)
        .eq('is_primary', true)
        .eq('user_id', user.id)
        .maybeSingle();

      if (primaryByUser.error && primaryByUser.error.code !== 'PGRST116') {
        return NextResponse.json({ message: primaryByUser.error.message }, { status: 500 });
      }
      isPrimaryLink = Boolean(primaryByUser.data?.id);
    }

    if (!isPrimaryLink) {
      return NextResponse.json(
        { message: 'Role updates must be performed from the primary profile link.' },
        { status: 403 }
      );
    }

    if (link.status !== 'accepted') {
      return NextResponse.json(
        { message: 'Role can only be updated for accepted members.' },
        { status: 400 }
      );
    }

    const { data: updatedRows, error: updateError } = await adminClient
      .from('care_circle_links')
      .update({
        relationship: nextRole,
        updated_at: new Date().toISOString(),
      })
      .eq('requester_id', link.requester_id)
      .eq('recipient_id', link.recipient_id)
      .eq('status', 'accepted')
      .select('id');

    if (updateError) {
      return NextResponse.json({ message: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      linkId: link.id,
      role: nextRole,
      status: link.status,
      recipientId: link.recipient_id,
      updatedCount: updatedRows?.length ?? 0,
    });
  } catch (error) {
    console.error('Error updating care circle role:', error);
    return NextResponse.json({ message: 'Failed to update care circle role' }, { status: 500 });
  }
}
