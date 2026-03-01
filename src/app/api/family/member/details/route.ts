import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

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

    if (!memberId) {
      return NextResponse.json({ message: 'Member ID is required.' }, { status: 400 });
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
      .eq('user_id', memberId)
      .eq('family_id', viewerMember.family_id)
      .maybeSingle();

    if (targetError || !targetMember) {
      return NextResponse.json({ message: 'Not allowed for this family member.' }, { status: 403 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const profilesByAuth = await adminClient
      .from('profiles')
      .select('id, display_name, name, phone, gender, address, is_primary, created_at')
      .eq('auth_id', memberId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1);

    const missingAuthColumn =
      profilesByAuth.error?.code === 'PGRST204' ||
      profilesByAuth.error?.message?.toLowerCase().includes('auth_id');

    let targetProfile:
      | {
          id: string;
          display_name: string | null;
          name: string | null;
          phone: string | null;
          gender: string | null;
          address: string | null;
        }
      | null = null;

    if (!profilesByAuth.error && profilesByAuth.data?.[0]) {
      targetProfile = profilesByAuth.data[0];
    } else {
      if (profilesByAuth.error && !missingAuthColumn && profilesByAuth.error.code !== 'PGRST116') {
        throw profilesByAuth.error;
      }
      const profilesByUser = await adminClient
        .from('profiles')
        .select('id, display_name, name, phone, gender, address, is_primary, created_at')
        .eq('user_id', memberId)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1);

      if (profilesByUser.error && profilesByUser.error.code !== 'PGRST116') {
        throw profilesByUser.error;
      }
      targetProfile = profilesByUser.data?.[0] ?? null;
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

    if (healthRes.error) throw healthRes.error;
    if (appointmentsRes.error) throw appointmentsRes.error;
    if (medicationsRes.error) throw medicationsRes.error;

    const personal = {
      display_name: targetProfile.display_name?.trim() || targetProfile.name?.trim() || null,
      phone: targetProfile.phone ?? null,
      gender: targetProfile.gender ?? null,
      address: targetProfile.address ?? null,
    };
    const health = healthRes.data ?? null;
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
    const appointments = parseJsonArray(appointmentsRes.data?.appointments, 'appointments');
    const medications = parseJsonArray(medicationsRes.data?.medications, 'medications');

    return NextResponse.json({
      personal,
      health,
      appointments,
      medications,
    });
  } catch (error) {
    console.error('Error fetching family member details:', error);
    return NextResponse.json(
      { message: 'Failed to fetch family member details' },
      { status: 500 }
    );
  }
}
