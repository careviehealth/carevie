import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
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
    
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const { contact } = await request.json();

    if (!contact) {
      return NextResponse.json({ message: 'Contact is required' }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { message: 'Service role key is missing.' },
        { status: 500 }
      );
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const { data: existingFamilyLink } = await supabase
      .from('family_links')
      .select('family_id, status')
      .or(`requester_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`)
      .in('status', ['accepted', 'pending'])
      .limit(1)
      .maybeSingle();

    const familyId = existingFamilyLink?.family_id ?? crypto.randomUUID();

    // Find user by phone number
    const { data: profileRows, error: userError } = await adminClient
      .from('profiles')
      .select('auth_id, user_id')
      .eq('phone', contact)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1);

    const recipientUserId = profileRows?.[0]?.auth_id ?? profileRows?.[0]?.user_id ?? null;

    if (userError || !recipientUserId) {
      return NextResponse.json(
        { message: 'User not found with this phone number' },
        { status: 404 }
      );
    }

    // Check if user is trying to invite themselves
    if (recipientUserId === session.user.id) {
      return NextResponse.json(
        { message: 'You cannot invite yourself' },
        { status: 400 }
      );
    }

    // Create family link - ADD THE RELATION FIELD
    const { error: linkError } = await supabase
      .from('family_links')
      .insert({
        requester_id: session.user.id,
        recipient_id: recipientUserId,
        family_id: familyId,
        relation: 'family', // ✅ Add this required field
        status: 'pending',
      });

    if (linkError) {
      console.error('Link error:', linkError); // Add logging to see the actual error
      
      if (linkError.code === '23505') {
        return NextResponse.json(
          { message: 'Invite already sent to this user' },
          { status: 409 }
        );
      }
      throw linkError;
    }

    return NextResponse.json({ message: 'Invite sent successfully' });
  } catch (error) {
    console.error('Error sending invite:', error);
    return NextResponse.json(
      { message: 'Failed to send invite' },
      { status: 500 }
    );
  }
}
