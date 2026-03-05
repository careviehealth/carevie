import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth';

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

const parseJsonArray = (value: unknown, fallbackKey: string) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>)[fallbackKey])) {
    return (value as Record<string, unknown>)[fallbackKey] as unknown[];
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>)[fallbackKey])) {
        return (parsed as Record<string, unknown>)[fallbackKey] as unknown[];
      }
    } catch {
      return [];
    }
  }
  return [];
};

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const linkId = url.searchParams.get('linkId')?.trim();

    if (!linkId) {
      return NextResponse.json({ message: 'linkId is required.' }, { status: 400 });
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

    const { data: targetProfile, error: profileError } = await adminClient
      .from('profiles')
      .select('id, display_name, name, phone, gender, address')
      .eq('id', link.profile_id)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      return NextResponse.json({ message: profileError.message }, { status: 500 });
    }

    if (!targetProfile?.id) {
      return NextResponse.json({ message: 'Member profile not found.' }, { status: 404 });
    }

    const [healthRes, appointmentsRes, medicationsRes] = await Promise.all([
      adminClient
        .from('health')
        .select(
          'date_of_birth, blood_group, bmi, age, current_diagnosed_condition, allergies, ongoing_treatments, current_medication, previous_diagnosed_conditions, past_surgeries, childhood_illness, long_term_treatments'
        )
        .eq('profile_id', targetProfile.id)
        .maybeSingle(),
      adminClient
        .from('user_appointments')
        .select('appointments')
        .eq('profile_id', targetProfile.id)
        .maybeSingle(),
      adminClient
        .from('user_medications')
        .select('medications')
        .eq('profile_id', targetProfile.id)
        .maybeSingle(),
    ]);

    if (healthRes.error) {
      return NextResponse.json({ message: healthRes.error.message }, { status: 500 });
    }
    if (appointmentsRes.error) {
      return NextResponse.json({ message: appointmentsRes.error.message }, { status: 500 });
    }
    if (medicationsRes.error) {
      return NextResponse.json({ message: medicationsRes.error.message }, { status: 500 });
    }

    const personal = {
      display_name: targetProfile.display_name?.trim() || targetProfile.name?.trim() || null,
      phone: targetProfile.phone ?? null,
      gender: targetProfile.gender ?? null,
      address: targetProfile.address ?? null,
    };

    const health = healthRes.data ?? null;
    const appointments = parseJsonArray(appointmentsRes.data?.appointments, 'appointments');
    const medications = parseJsonArray(medicationsRes.data?.medications, 'medications');

    return NextResponse.json({
      personal,
      health,
      appointments,
      medications,
    });
  } catch (error) {
    console.error('Error fetching care circle member details:', error);
    return NextResponse.json(
      { message: 'Failed to fetch care circle member details' },
      { status: 500 }
    );
  }
}
