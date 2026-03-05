import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth';
import { isValidFileName } from '@/lib/validation';

const CARE_CIRCLE_FOLDERS = ['reports', 'prescriptions', 'insurance', 'bills'] as const;
type CareCircleFolder = (typeof CARE_CIRCLE_FOLDERS)[number];
type CareCircleRole = 'family' | 'friend';

type LinkRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined';
  relationship: string | null;
  profile_id: string | null;
};

const normalizeCareCircleRole = (value: string | null | undefined): CareCircleRole => {
  const normalized = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (normalized === 'family') return 'family';
  return 'friend';
};

const canReadMedicalData = (role: CareCircleRole) => role === 'family';

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const linkId = url.searchParams.get('linkId')?.trim();
    const folder = url.searchParams.get('folder') as CareCircleFolder | null;
    const name = url.searchParams.get('name')?.trim() ?? '';

    if (!linkId || !folder || !name) {
      return NextResponse.json({ message: 'Missing required parameters.' }, { status: 400 });
    }

    if (!isValidFileName(name)) {
      return NextResponse.json({ error: 'Invalid file name.' }, { status: 400 });
    }

    if (!CARE_CIRCLE_FOLDERS.includes(folder)) {
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

    const role = normalizeCareCircleRole(link.relationship);
    const isAuthorizedRecipient =
      link.recipient_id === user.id && link.status === 'accepted' && canReadMedicalData(role);

    if (!isAuthorizedRecipient) {
      return NextResponse.json({ message: 'Not allowed for this care circle member.' }, { status: 403 });
    }

    if (!link.profile_id) {
      return NextResponse.json({ message: 'Owner profile is not available.' }, { status: 404 });
    }

    const path = `${link.profile_id}/${folder}/${name}`;
    const { data, error } = await adminClient.storage.from('medical-vault').createSignedUrl(path, 60);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ message: 'Unable to create signed URL.' }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    console.error('Error creating care circle vault signed url:', error);
    return NextResponse.json({ message: 'Failed to create signed url' }, { status: 500 });
  }
}
