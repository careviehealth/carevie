// Appointment reminder scheduler.
//
// Stages: 24h, 2h, 30m before each appointment. Reschedules are handled by
// keying the dedupe on the absolute occurrence time — a moved appointment
// produces a new dedupe key, so old reminders get cancelled by the
// keep-set logic and new ones enqueue cleanly.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cancelPendingJobsForSource,
  enqueueJob,
} from '@/lib/notifications/repository';
import {
  appointmentChangedDedupeKey,
  appointmentReminderDedupeKey,
} from '@/lib/notifications/dedupe';
import { zonedWallClockToInstant } from '@/lib/notifications/timezone';
import { getOrInitPreferences } from '@/lib/notifications/preferences';
import { dispatchNotification } from '@/lib/notifications/dispatch';
import { resolveProfileRecipients } from './recipients';

export type AppointmentRecord = {
  id: string;
  date: string; // YYYY-MM-DD (in user's local tz)
  time: string; // HH:MM
  title?: string;
  type?: string;
};

const STAGES = [
  { key: '24h' as const, leadMs: 24 * 60 * 60 * 1000 },
  { key: '2h' as const, leadMs: 2 * 60 * 60 * 1000 },
  { key: '30m' as const, leadMs: 30 * 60 * 1000 },
];

const APPOINTMENT_SOURCE_TYPE = 'appointment_reminder';

const parseHHMM = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s ?? '');
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { hour, minute };
};

const parseYMD = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
};

type ReconcileAppointmentParams = {
  adminClient: SupabaseClient;
  profileId: string;
  appointments: AppointmentRecord[];
  onlyAppointmentId?: string;
  // When true (and `onlyAppointmentId` is set), also fire an immediate
  // `appointment_changed` notification so the user sees a confirmation in the
  // bell + a push without waiting for the 30m/2h/24h reminder stages. The
  // dedupe is keyed off the appointment's current fields so re-saving with
  // the same data is a no-op.
  notifyImmediately?: boolean;
};

const buildAppointmentFingerprint = (appt: AppointmentRecord): string => {
  return [appt.date ?? '', appt.time ?? '', appt.title ?? '', appt.type ?? ''].join('|');
};

const formatAppointmentWhen = (
  ymd: { year: number; month: number; day: number },
  hm: { hour: number; minute: number },
  tz: string
): string => {
  try {
    const iso = zonedWallClockToInstant(
      { year: ymd.year, month: ymd.month, day: ymd.day, hour: hm.hour, minute: hm.minute },
      tz
    );
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(iso);
  } catch {
    const hh = String(hm.hour).padStart(2, '0');
    const mm = String(hm.minute).padStart(2, '0');
    return `${ymd.year}-${String(ymd.month).padStart(2, '0')}-${String(ymd.day).padStart(2, '0')} ${hh}:${mm}`;
  }
};

export const reconcileAppointmentSchedule = async ({
  adminClient,
  profileId,
  appointments,
  onlyAppointmentId,
  notifyImmediately,
}: ReconcileAppointmentParams): Promise<{
  jobsEnqueued: number;
  jobsCancelled: number;
  recipients: number;
}> => {
  const recipients = await resolveProfileRecipients(adminClient, profileId, 'appointments');
  if (recipients.length === 0) {
    return { jobsEnqueued: 0, jobsCancelled: 0, recipients: 0 };
  }

  // Owner name (used in member-facing immediate confirmations). Best-effort.
  let ownerDisplayName: string | null = null;
  if (notifyImmediately) {
    try {
      const { data } = await adminClient
        .from('profiles')
        .select('display_name, name')
        .eq('id', profileId)
        .maybeSingle();
      const dn = (data as { display_name?: string | null } | null)?.display_name;
      const n = (data as { name?: string | null } | null)?.name;
      ownerDisplayName =
        (typeof dn === 'string' && dn.trim()) || (typeof n === 'string' && n.trim()) || null;
    } catch {
      ownerDisplayName = null;
    }
  }

  const timezoneByRecipient = new Map<string, string>();
  await Promise.all(
    recipients.map(async (r) => {
      const prefs = await getOrInitPreferences(adminClient, r.userId);
      timezoneByRecipient.set(r.userId, prefs.timezone);
    })
  );

  const now = Date.now();
  const targetAppointments = onlyAppointmentId
    ? appointments.filter((a) => a.id === onlyAppointmentId)
    : appointments;

  let jobsEnqueued = 0;
  // Keyed per appointment so we can cancel obsolete jobs after.
  const desiredByAppointment = new Map<string, Set<string>>();

  for (const appointment of targetAppointments) {
    if (!appointment.id) continue;
    const ymd = parseYMD(appointment.date);
    const hm = parseHHMM(appointment.time);
    if (!ymd || !hm) continue;

    const desiredForAppointment = new Set<string>();
    for (const recipient of recipients) {
      const tz = timezoneByRecipient.get(recipient.userId) ?? 'UTC';
      // Appointment date/time is interpreted in the *owner's* local tz, but
      // for now we use the recipient's tz as a reasonable proxy because the
      // legacy data model has no separate appointment timezone field.
      const occursAt = zonedWallClockToInstant(
        { year: ymd.year, month: ymd.month, day: ymd.day, hour: hm.hour, minute: hm.minute },
        tz
      );
      if (Number.isNaN(occursAt.getTime())) continue;

      for (const stage of STAGES) {
        const fireAt = new Date(occursAt.getTime() - stage.leadMs);
        if (fireAt.getTime() < now - 60_000) continue; // skip stages already past
        const dedupeKey = appointmentReminderDedupeKey({
          recipientUserId: recipient.userId,
          profileId,
          appointmentId: appointment.id,
          stage: stage.key,
          occursAtIso: occursAt.toISOString(),
        });
        desiredForAppointment.add(dedupeKey);

        const enq = await enqueueJob(adminClient, {
          jobType: 'materialize_reminder',
          payload: {
            category: 'appointment_upcoming',
            recipientUserId: recipient.userId,
            profileId,
            appointmentId: appointment.id,
            appointmentTitle: appointment.title ?? appointment.type ?? 'Appointment',
            appointmentType: appointment.type ?? null,
            stage: stage.key,
            occursAt: occursAt.toISOString(),
            scheduledFor: fireAt.toISOString(),
            dedupeKey,
            isOwnerNotification: recipient.isOwner,
          },
          runAt: fireAt,
          dedupeKey,
          sourceType: APPOINTMENT_SOURCE_TYPE,
          sourceId: appointment.id,
        });
        if (enq.created) jobsEnqueued += 1;
      }
    }
    desiredByAppointment.set(appointment.id, desiredForAppointment);

    // Immediate confirmation notification ("Appointment scheduled" / "updated")
    // — only when reconciling a single appointment via onlyAppointmentId, so
    // we don't spam the user during a full re-import.
    if (notifyImmediately && onlyAppointmentId && appointment.id === onlyAppointmentId) {
      const fingerprint = buildAppointmentFingerprint(appointment);
      const ymd = parseYMD(appointment.date);
      const hm = parseHHMM(appointment.time);
      const label = appointment.title || appointment.type || 'Appointment';
      const ownerName = ownerDisplayName ?? null;
      await Promise.all(
        recipients.map(async (recipient) => {
          const tz = timezoneByRecipient.get(recipient.userId) ?? 'UTC';
          const whenLabel = ymd && hm ? formatAppointmentWhen(ymd, hm, tz) : '';
          const dedupeKey = appointmentChangedDedupeKey({
            recipientUserId: recipient.userId,
            appointmentId: appointment.id,
            changeFingerprint: fingerprint,
          });
          const title = recipient.isOwner
            ? 'Appointment saved'
            : ownerName
              ? `${ownerName} scheduled an appointment`
              : 'Appointment scheduled in your care circle';
          const subjectFor =
            recipient.isOwner || !ownerName ? '' : ` · for ${ownerName}'s profile`;
          const body = whenLabel
            ? `${label} · ${whenLabel}${subjectFor}`
            : `${label}${subjectFor}`;
          try {
            await dispatchNotification(adminClient, {
              userId: recipient.userId,
              profileId,
              category: 'appointment_changed',
              title,
              body,
              metadata: {
                appointmentId: appointment.id,
                appointmentTitle: label,
                appointmentType: appointment.type ?? null,
                date: appointment.date,
                time: appointment.time,
                ownerName,
              },
              sourceType: 'appointment',
              sourceId: appointment.id,
              dedupeKey,
              deepLink: '/app/homepage?open=calendar',
            });
          } catch (err) {
            console.warn(
              '[notifications] immediate appointment_changed dispatch failed:',
              err instanceof Error ? err.message : err
            );
          }
        })
      );
    }
  }

  // Cancel obsolete pending jobs for the targeted appointments
  let jobsCancelled = 0;
  for (const [appointmentId, keepSet] of desiredByAppointment) {
    jobsCancelled += await cancelPendingJobsForSource(adminClient, {
      sourceType: APPOINTMENT_SOURCE_TYPE,
      sourceId: appointmentId,
      keepDedupeKeys: Array.from(keepSet),
    });
  }

  return { jobsEnqueued, jobsCancelled, recipients: recipients.length };
};

export const cancelAppointmentSchedule = async (
  adminClient: SupabaseClient,
  appointmentId: string
) => {
  const cancelled = await cancelPendingJobsForSource(adminClient, {
    sourceType: APPOINTMENT_SOURCE_TYPE,
    sourceId: appointmentId,
  });
  return { cancelled };
};
