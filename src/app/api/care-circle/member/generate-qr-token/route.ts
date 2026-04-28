import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/auth';
import { authorizeCareCircleMemberAccess } from '@/lib/careCirclePermissions';
import { getBackendInternalHeaders } from '@/lib/backendInternalAuth';

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const linkId = typeof body?.linkId === 'string' ? body.linkId.trim() : '';

    if (!linkId) {
      return NextResponse.json({ message: 'linkId is required.' }, { status: 400 });
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const authResult = await authorizeCareCircleMemberAccess({
      adminClient,
      user,
      linkId,
      requiredPermission: 'emergency_card',
    });

    if (!authResult.ok) {
      return NextResponse.json({ message: authResult.message }, { status: authResult.status });
    }

    const { ownerProfileId } = authResult.access;

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

    const backendRes = await fetch(`${backendUrl}/api/share/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getBackendInternalHeaders(),
      },
      body: JSON.stringify({ profile_id: ownerProfileId }),
    });

    if (!backendRes.ok) {
      return NextResponse.json({ message: 'Failed to generate QR token.' }, { status: 502 });
    }

    const data = await backendRes.json();

    if (!data.token) {
      return NextResponse.json({ message: 'Invalid response from token service.' }, { status: 502 });
    }

    return NextResponse.json({ token: data.token, expires_at: data.expires_at });
  } catch (error) {
    console.error('Error generating care circle QR token:', error);
    return NextResponse.json({ message: 'Failed to generate QR token.' }, { status: 500 });
  }
}