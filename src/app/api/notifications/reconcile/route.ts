// Owner-side reconciliation endpoint. The homepage talks to Supabase directly
// for medication/appointment writes, so it can't run scheduler reconciliation
// itself (which needs admin privileges). This route accepts a profileId + kind
// and re-reads the canonical jsonb list from supabase admin, then runs the
// matching scheduler. Authorized only for the profile owner.

import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';
import {
  reconcileMedicationSchedule,
  cancelMedicationSchedule,
} from '@/lib/notifications/schedulers/medication';
import {
  reconcileAppointmentSchedule,
  cancelAppointmentSchedule,
  type AppointmentRecord,
} from '@/lib/notifications/schedulers/appointment';
import { ownerUserIdForProfile } from '@/lib/notifications/schedulers/recipients';
import { triggerOpportunisticDrain } from '@/lib/notifications/opportunisticDrain';
import type { MedicationRecord } from '@/lib/medications';

type Body = {
  profileId?: string;
  kind?: 'medications' | 'appointments';
  onlyMedicationId?: string;
  onlyAppointmentId?: string;
  cancelMedicationId?: string;
  cancelAppointmentId?: string;
  notifyImmediately?: boolean;
};

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Body | null;
    const profileId = body?.profileId?.trim() ?? '';
    const kind = body?.kind;
    if (!profileId || (kind !== 'medications' && kind !== 'appointments')) {
      return NextResponse.json(
        { message: 'profileId and kind=medications|appointments are required.' },
        { status: 400 }
      );
    }

    const adminClient = createSupabaseAdminClient();
    triggerOpportunisticDrain(adminClient);
    const ownerUserId = await ownerUserIdForProfile(adminClient, profileId);
    if (!ownerUserId) {
      return NextResponse.json({ message: 'Profile not found.' }, { status: 404 });
    }
    if (ownerUserId !== user.id) {
      return NextResponse.json(
        { message: 'Only the profile owner can reconcile their schedule.' },
        { status: 403 }
      );
    }

    if (kind === 'medications') {
      if (body?.cancelMedicationId) {
        const cancelled = await cancelMedicationSchedule(adminClient, body.cancelMedicationId);
        return NextResponse.json({ ok: true, cancelled });
      }
      const { data, error } = await adminClient
        .from('user_medications')
        .select('medications')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
      }
      const medications = (data?.medications ?? []) as MedicationRecord[];
      const result = await reconcileMedicationSchedule({
        adminClient,
        profileId,
        medications,
        onlyMedicationId: body?.onlyMedicationId,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body?.cancelAppointmentId) {
      const cancelled = await cancelAppointmentSchedule(adminClient, body.cancelAppointmentId);
      return NextResponse.json({ ok: true, cancelled });
    }
    const { data, error } = await adminClient
      .from('user_appointments')
      .select('appointments')
      .eq('profile_id', profileId)
      .maybeSingle();
    if (error) {
      return NextResponse.json({ message: error.message }, { status: 500 });
    }
    const appointments = (data?.appointments ?? []) as AppointmentRecord[];
    const result = await reconcileAppointmentSchedule({
      adminClient,
      profileId,
      appointments,
      onlyAppointmentId: body?.onlyAppointmentId,
      notifyImmediately: body?.notifyImmediately === true,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[notifications/reconcile] error:', error);
    return NextResponse.json({ message: 'Failed to reconcile schedule.' }, { status: 500 });
  }
}
