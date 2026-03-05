import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth';

type InviteDecision = 'accepted' | 'declined';

type RespondPayload = {
  linkId?: string;
  decision?: string;
};

type LinkRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined';
};

const normalizeDecision = (value: string | null | undefined): InviteDecision | null => {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'accepted') return 'accepted';
  if (normalized === 'declined') return 'declined';
  return null;
};

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ message: 'Service role key is missing.' }, { status: 500 });
    }

    let payload: RespondPayload;
    try {
      payload = (await request.json()) as RespondPayload;
    } catch {
      return NextResponse.json({ message: 'Invalid request payload.' }, { status: 400 });
    }

    const linkId = payload.linkId?.trim();
    const decision = normalizeDecision(payload.decision);

    if (!linkId) {
      return NextResponse.json({ message: 'linkId is required.' }, { status: 400 });
    }
    if (!decision) {
      return NextResponse.json({ message: 'decision must be accepted or declined.' }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    const { data: linkRow, error: linkError } = await adminClient
      .from('care_circle_links')
      .select('id, requester_id, recipient_id, status')
      .eq('id', linkId)
      .maybeSingle();

    if (linkError && linkError.code !== 'PGRST116') {
      return NextResponse.json({ message: linkError.message }, { status: 500 });
    }

    const link = linkRow as LinkRow | null;
    if (!link) {
      return NextResponse.json({ message: 'Care circle invite not found.' }, { status: 404 });
    }
    if (link.recipient_id !== user.id) {
      return NextResponse.json({ message: 'Only the recipient can respond to this invite.' }, { status: 403 });
    }

    const { data: pendingRows, error: pendingError } = await adminClient
      .from('care_circle_links')
      .select('id')
      .eq('requester_id', link.requester_id)
      .eq('recipient_id', link.recipient_id)
      .eq('status', 'pending');

    if (pendingError) {
      return NextResponse.json({ message: pendingError.message }, { status: 500 });
    }
    if (!pendingRows?.length) {
      return NextResponse.json({ message: 'No pending invites found for this member.' }, { status: 400 });
    }

    const { data: updatedRows, error: updateError } = await adminClient
      .from('care_circle_links')
      .update({
        status: decision,
        updated_at: new Date().toISOString(),
      })
      .eq('requester_id', link.requester_id)
      .eq('recipient_id', link.recipient_id)
      .eq('status', 'pending')
      .select('id');

    if (updateError) {
      return NextResponse.json({ message: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      linkId: link.id,
      requesterId: link.requester_id,
      recipientId: link.recipient_id,
      decision,
      updatedCount: updatedRows?.length ?? pendingRows.length,
    });
  } catch (error) {
    console.error('Error responding to care circle invite:', error);
    return NextResponse.json({ message: 'Failed to respond to care circle invite' }, { status: 500 });
  }
}
