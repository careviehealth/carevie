import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

type FamilyLink = {
  family_id: string | null;
  status: string;
};

async function getFamilyId(supabase: ReturnType<typeof createServerClient>, userId: string) {
  const { data: userLinks, error } = await supabase
    .from('family_links')
    .select('family_id, status')
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);

  if (error) throw error;

  const acceptedLink = (userLinks || []).find((link: FamilyLink) => link.status === 'accepted');
  const pendingLink = (userLinks || []).find((link: FamilyLink) => link.status === 'pending');
  return acceptedLink?.family_id ?? pendingLink?.family_id ?? null;
}

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

    const familyId = await getFamilyId(supabase, session.user.id);
    if (!familyId) {
      return NextResponse.json({ message: 'Not allowed for this family member.' }, { status: 403 });
    }

    const { data: linkRow, error: linkError } = await supabase
      .from('family_links')
      .select('id')
      .eq('family_id', familyId)
      .eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${session.user.id},recipient_id.eq.${memberId}),and(requester_id.eq.${memberId},recipient_id.eq.${session.user.id})`
      )
      .maybeSingle();

    if (linkError || (!linkRow && session.user.id !== memberId)) {
      return NextResponse.json({ message: 'Not allowed for this family member.' }, { status: 403 });
    }

    const { data: healthRow, error: healthError } = await supabase
      .from('health')
      .select(
        `
        date_of_birth,
        blood_group,
        current_diagnosed_condition,
        allergies,
        ongoing_treatments,
        current_medication,
        bmi,
        age
      `
      )
      .eq('user_id', memberId)
      .maybeSingle();

    if (healthError) throw healthError;

    return NextResponse.json(healthRow ?? null);
  } catch (error) {
    console.error('Error fetching health record:', error);
    return NextResponse.json({ message: 'Failed to fetch health record' }, { status: 500 });
  }
}
