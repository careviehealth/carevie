import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isValidUUID } from '@/lib/validation';

type FamilyLink = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: string;
  family_id: string | null;
  requester_relation: string | null;
  recipient_relation: string | null;
};

type FamilyLinkStatus = Pick<FamilyLink, 'family_id' | 'status'>;

async function getFamilyId(supabase: ReturnType<typeof createServerClient>, userId: string) {
  const { data: userLinks, error } = await supabase
    .from('family_links')
    .select('family_id, status')
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);

  if (error) throw error;

  const links = (userLinks ?? []) as FamilyLinkStatus[];
  const acceptedLink = links.find((link) => link.status === 'accepted');
  const pendingLink = links.find((link) => link.status === 'pending');
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

    const familyId = await getFamilyId(supabase, session.user.id);

    if (!familyId) {
      return NextResponse.json({ relations: {} });
    }

    const url = new URL(request.url);
    const memberIdsParam = url.searchParams.get('memberIds');
    const memberIds = (memberIdsParam || '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (memberIds.length === 0) {
      return NextResponse.json({ relations: {} });
    }

    if (memberIds.some(id => !isValidUUID(id))) {
      return NextResponse.json({ message: 'Invalid member ID format.' }, { status: 400 });
    }

    const { data: familyLinks, error: familyLinksError } = await supabase
      .from('family_links')
      .select(
        'id, requester_id, recipient_id, status, family_id, requester_relation, recipient_relation'
      )
      .eq('family_id', familyId)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`);

    if (familyLinksError) throw familyLinksError;

    const relations: Record<string, string> = {};
    (familyLinks || []).forEach((link: FamilyLink) => {
      const isRequester = link.requester_id === session.user.id;
      const otherId = isRequester ? link.recipient_id : link.requester_id;
      if (!memberIds.includes(otherId)) return;
      const relation = isRequester ? link.requester_relation : link.recipient_relation;
      if (relation) relations[otherId] = relation;
    });

    return NextResponse.json({ relations });
  } catch (error) {
    console.error('Error fetching family relations:', error);
    return NextResponse.json({ message: 'Failed to fetch family relations' }, { status: 500 });
  }
}

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

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const memberId = String(body.memberId || '');
    const relation = String(body.relation || '');

    if (!memberId) {
      return NextResponse.json({ message: 'Member ID is required.' }, { status: 400 });
    }

    if (!isValidUUID(memberId)) {
      return NextResponse.json({ message: 'Invalid member ID.' }, { status: 400 });
    }

    const familyId = await getFamilyId(supabase, session.user.id);
    if (!familyId) {
      return NextResponse.json({ message: 'No family available.' }, { status: 403 });
    }

    const { data: linkRow, error: linkError } = await supabase
      .from('family_links')
      .select(
        'id, requester_id, recipient_id, status, family_id, requester_relation, recipient_relation'
      )
      .eq('family_id', familyId)
      .eq('status', 'accepted')
      .or(
        `and(requester_id.eq.${session.user.id},recipient_id.eq.${memberId}),and(requester_id.eq.${memberId},recipient_id.eq.${session.user.id})`
      )
      .maybeSingle();

    if (linkError || !linkRow) {
      return NextResponse.json({ message: 'Not allowed for this family member.' }, { status: 403 });
    }

    const isRequester = linkRow.requester_id === session.user.id;
    const updatePayload = isRequester
      ? { requester_relation: relation || null }
      : { recipient_relation: relation || null };

    const { error: updateError } = await supabase
      .from('family_links')
      .update(updatePayload)
      .eq('id', linkRow.id);

    if (updateError) throw updateError;

    return NextResponse.json({ message: 'Relation saved.' });
  } catch (error) {
    console.error('Error saving family relation:', error);
    return NextResponse.json({ message: 'Failed to save relation' }, { status: 500 });
  }
}
