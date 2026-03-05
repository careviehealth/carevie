import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth';
import {
  logCareCircleActivity,
  type CareCircleActivityAction,
  type CareCircleActivityDomain,
} from '@/lib/careCircleActivityLogs';

type ProfileActivityPayload = {
  profileId?: unknown;
  domain?: unknown;
  action?: unknown;
  entity?: unknown;
  metadata?: unknown;
};

const ALLOWED_DOMAINS: CareCircleActivityDomain[] = ['vault', 'medication', 'appointment'];
const ALLOWED_ACTIONS: CareCircleActivityAction[] = ['upload', 'rename', 'delete', 'add', 'update'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isCareCircleActivityDomain = (value: string): value is CareCircleActivityDomain =>
  ALLOWED_DOMAINS.includes(value as CareCircleActivityDomain);

const isCareCircleActivityAction = (value: string): value is CareCircleActivityAction =>
  ALLOWED_ACTIONS.includes(value as CareCircleActivityAction);

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

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as ProfileActivityPayload | null;
    const profileId = typeof body?.profileId === 'string' ? body.profileId.trim() : '';
    const domain = typeof body?.domain === 'string' ? body.domain.trim() : '';
    const action = typeof body?.action === 'string' ? body.action.trim() : '';

    if (!profileId) {
      return NextResponse.json({ message: 'profileId is required.' }, { status: 400 });
    }
    if (!isCareCircleActivityDomain(domain)) {
      return NextResponse.json({ message: 'Invalid domain.' }, { status: 400 });
    }
    if (!isCareCircleActivityAction(action)) {
      return NextResponse.json({ message: 'Invalid action.' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    const { data: ownedByAuth, error: ownedByAuthError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', profileId)
      .eq('auth_id', user.id)
      .maybeSingle();

    const authColumnMissing =
      ownedByAuthError?.code === 'PGRST204' ||
      ownedByAuthError?.message?.toLowerCase().includes('auth_id');
    if (ownedByAuthError && ownedByAuthError.code !== 'PGRST116' && !authColumnMissing) {
      return NextResponse.json({ message: ownedByAuthError.message }, { status: 500 });
    }

    const { data: ownedByUser, error: ownedByUserError } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', profileId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (ownedByUserError && ownedByUserError.code !== 'PGRST116') {
      return NextResponse.json({ message: ownedByUserError.message }, { status: 500 });
    }

    const ownsProfile = Boolean(ownedByAuth?.id || ownedByUser?.id);
    if (!ownsProfile) {
      return NextResponse.json({ message: 'Not allowed for this profile.' }, { status: 403 });
    }

    const { data: actorProfileRow, error: actorProfileError } = await adminClient
      .from('profiles')
      .select('display_name, name')
      .eq('id', profileId)
      .maybeSingle();

    if (actorProfileError && actorProfileError.code !== 'PGRST116') {
      return NextResponse.json({ message: actorProfileError.message }, { status: 500 });
    }

    const actorDisplayName =
      actorProfileRow?.display_name?.trim() || actorProfileRow?.name?.trim() || null;

    const entity = isObject(body?.entity) ? body?.entity : null;
    const metadata = isObject(body?.metadata) ? body.metadata : {};

    await logCareCircleActivity({
      adminClient,
      profileId,
      actorUserId: user.id,
      actorProfileId: profileId,
      actorDisplayName,
      domain,
      action,
      entity: {
        id: typeof entity?.id === 'string' ? entity.id : null,
        label: typeof entity?.label === 'string' ? entity.label : null,
      },
      metadata,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error writing profile activity log:', error);
    return NextResponse.json({ message: 'Failed to write profile activity log.' }, { status: 500 });
  }
}
