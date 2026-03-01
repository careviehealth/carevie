import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

type FamilyMemberRow = {
  family_id: string;
  role: 'owner' | 'member';
};

export async function POST() {
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

    const { data: memberRow, error: memberError } = await supabase
      .from('family_members')
      .select('family_id, role')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (memberError || !memberRow?.family_id) {
      return NextResponse.json(
        { message: 'Not allowed for this family member.' },
        { status: 403 }
      );
    }

    const member = memberRow as FamilyMemberRow;
    if (member.role !== 'owner') {
      return NextResponse.json(
        { message: 'Only the family owner can delete this family.' },
        { status: 403 }
      );
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const familyId = member.family_id;

    const joinRequestRes = await adminClient
      .from('family_join_requests')
      .delete()
      .eq('family_id', familyId);
    if (joinRequestRes.error) throw joinRequestRes.error;

    const linksRes = await adminClient
      .from('family_links')
      .delete()
      .eq('family_id', familyId);
    if (linksRes.error) throw linksRes.error;

    const membersRes = await adminClient
      .from('family_members')
      .delete()
      .eq('family_id', familyId);
    if (membersRes.error) throw membersRes.error;

    const familyRes = await adminClient
      .from('families')
      .delete()
      .eq('id', familyId);
    if (familyRes.error) throw familyRes.error;

    return NextResponse.json({ message: 'Family deleted.' });
  } catch (error) {
    console.error('Error deleting family:', error);
    return NextResponse.json({ message: 'Failed to delete family' }, { status: 500 });
  }
}
