import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const FAMILY_MEMBER_LIMIT = 10;

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
    const familyId = url.searchParams.get('familyId');

    if (!familyId) {
      return NextResponse.json({ message: 'Family ID is required.' }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const { count, error } = await adminClient
      .from('family_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('family_id', familyId);

    if (error) {
      throw error;
    }

    const memberCount = count ?? 0;

    return NextResponse.json({
      memberCount,
      limit: FAMILY_MEMBER_LIMIT,
      isFull: memberCount >= FAMILY_MEMBER_LIMIT,
    });
  } catch (error) {
    console.error('Error fetching family capacity:', error);
    return NextResponse.json(
      { message: 'Failed to fetch family capacity' },
      { status: 500 }
    );
  }
}
