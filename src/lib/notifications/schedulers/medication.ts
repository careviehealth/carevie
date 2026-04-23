// Medication reminder scheduler.
//
// Strategy: instead of generating notifications client-side every minute, we
// "reconcile" the future schedule. Given the user's current medication list,
// compute the desired set of (medicationId, date, slot) reminders for the next
// HORIZON_DAYS, enqueue a `materialize_reminder` job per slot at its actual
// firing time, and cancel any previously enqueued jobs that are no longer in
// the desired set (e.g. the user changed their meal timings).
//
// Jobs are enqueued once-per-source so reschedules naturally invalidate stale
// reminders. Idempotency is guaranteed by `notification_jobs.dedupe_key`.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cancelPendingJobsForSource,
  enqueueJob,
} from '@/lib/notifications/repository';
import {
  medicationDoseDedupeKey,
} from '@/lib/notifications/dedupe';
import {
  addDaysToDateKey,
  dateKeyInZone,
  parseDateKey,
  zonedWallClockToInstant,
} from '@/lib/notifications/timezone';
import {
  deriveMedicationMealTiming,
  getMedicationReminderSlots,
  isMedicationReminderActiveOnDate,
  type MedicationRecord,
  type MedicationReminderSlot,
} from '@/lib/medications';
import { getOrInitPreferences } from '@/lib/notifications/preferences';
import { resolveProfileRecipients } from './recipients';

export const MEDICATION_HORIZON_DAYS = 7;
export const MEDICATION_MISSED_GRACE_MINUTES = 90;

const sourceTypeFor = (variant: 'due' | 'missed') => `medication_${variant}`;

type ReconcileMedicationParams = {
  adminClient: SupabaseClient;
  profileId: string;
  medications: MedicationRecord[];
  // Optional: limit to a specific medication (for tighter targeted reschedules).
  onlyMedicationId?: string;
};

const buildSlotInstants = (params: {
  startDateKey: string;
  endDateKey: string;
  timezone: string;
  medication: MedicationRecord;
  slots: MedicationReminderSlot[];
}) => {
  const start = parseDateKey(params.startDateKey);
  const end = parseDateKey(params.endDateKey);
  if (!start || !end) return [] as Array<{ dateKey: string; slot: MedicationReminderSlot; at: Date }>;

  const out: Array<{ dateKey: string; slot: MedicationReminderSlot; at: Date }> = [];
  let current = params.startDateKey;
  while (current <= params.endDateKey) {
    if (isMedicationReminderActiveOnDate(params.medication, current)) {
      const day = parseDateKey(current);
      if (day) {
        for (const slot of params.slots) {
          const at = zonedWallClockToInstant(
            { year: day.year, month: day.month, day: day.day, hour: slot.hour, minute: slot.minute },
            params.timezone
          );
          out.push({ dateKey: current, slot, at });
        }
      }
    }
    const next = addDaysToDateKey(current, 1);
    if (!next || next === current) break;
    current = next;
  }
  return out;
};

export const reconcileMedicationSchedule = async ({
  adminClient,
  profileId,
  medications,
  onlyMedicationId,
}: ReconcileMedicationParams): Promise<{
  jobsEnqueued: number;
  jobsCancelled: number;
  recipients: number;
}> => {
  const recipients = await resolveProfileRecipients(adminClient, profileId, 'medications');
  if (recipients.length === 0) {
    return { jobsEnqueued: 0, jobsCancelled: 0, recipients: 0 };
  }

  // Each recipient has their own timezone preference — reminders fire at their
  // local meal times. The owner is included via the same loop.
  const timezoneByRecipient = new Map<string, string>();
  await Promise.all(
    recipients.map(async (r) => {
      const prefs = await getOrInitPreferences(adminClient, r.userId);
      timezoneByRecipient.set(r.userId, prefs.timezone);
    })
  );

  const startInstant = new Date();
  const targetMedications = onlyMedicationId
    ? medications.filter((m) => m.id === onlyMedicationId)
    : medications;

  const desiredKeysBySource = new Map<string, Set<string>>();
  let jobsEnqueued = 0;

  for (const medication of targetMedications) {
    if (!medication.id) continue;
    const slots = getMedicationReminderSlots({
      mealTiming: deriveMedicationMealTiming(medication.mealTiming, medication.frequency),
      frequency: medication.frequency,
    });
    if (slots.length === 0) continue;

    for (const recipient of recipients) {
      const tz = timezoneByRecipient.get(recipient.userId) ?? 'UTC';
      const todayKey = dateKeyInZone(startInstant, tz);
      const horizonKey = addDaysToDateKey(todayKey, MEDICATION_HORIZON_DAYS) ?? todayKey;
      const slotInstants = buildSlotInstants({
        startDateKey: todayKey,
        endDateKey: horizonKey,
        timezone: tz,
        medication,
        slots,
      });

      const dueSourceType = sourceTypeFor('due');
      const missedSourceType = sourceTypeFor('missed');
      const dueSourceKey = `${dueSourceType}:${recipient.userId}:${medication.id}`;
      const missedSourceKey = `${missedSourceType}:${recipient.userId}:${medication.id}`;
      const dueDesired = desiredKeysBySource.get(dueSourceKey) ?? new Set<string>();
      const missedDesired = desiredKeysBySource.get(missedSourceKey) ?? new Set<string>();

      for (const { dateKey, slot, at } of slotInstants) {
        if (at.getTime() < startInstant.getTime() - 60_000) continue; // skip past slots
        const dueDedupeKey = medicationDoseDedupeKey({
          recipientUserId: recipient.userId,
          profileId,
          medicationId: medication.id,
          dateKey,
          slotKey: slot.key,
          variant: 'due',
        });
        const missedDedupeKey = medicationDoseDedupeKey({
          recipientUserId: recipient.userId,
          profileId,
          medicationId: medication.id,
          dateKey,
          slotKey: slot.key,
          variant: 'missed',
        });
        dueDesired.add(dueDedupeKey);
        missedDesired.add(missedDedupeKey);

        // Due reminder fires at the slot time
        const enqDue = await enqueueJob(adminClient, {
          jobType: 'materialize_reminder',
          payload: {
            category: 'medication_due',
            recipientUserId: recipient.userId,
            profileId,
            medicationId: medication.id,
            medicationName: medication.name,
            dosage: medication.dosage,
            slotKey: slot.key,
            slotLabel: slot.label,
            slotContext: slot.context,
            dateKey,
            scheduledFor: at.toISOString(),
            dedupeKey: dueDedupeKey,
            isOwnerNotification: recipient.isOwner,
          },
          runAt: at,
          dedupeKey: dueDedupeKey,
          sourceType: dueSourceType,
          sourceId: medication.id,
        });
        if (enqDue.created) jobsEnqueued += 1;

        // Missed reminder fires after the grace window
        const missedAt = new Date(at.getTime() + MEDICATION_MISSED_GRACE_MINUTES * 60 * 1000);
        if (missedAt.getTime() > startInstant.getTime() - 60_000) {
          const enqMissed = await enqueueJob(adminClient, {
            jobType: 'materialize_reminder',
            payload: {
              category: 'medication_missed',
              recipientUserId: recipient.userId,
              profileId,
              medicationId: medication.id,
              medicationName: medication.name,
              dosage: medication.dosage,
              slotKey: slot.key,
              slotLabel: slot.label,
              slotContext: slot.context,
              dateKey,
              scheduledFor: missedAt.toISOString(),
              dedupeKey: missedDedupeKey,
              isOwnerNotification: recipient.isOwner,
            },
            runAt: missedAt,
            dedupeKey: missedDedupeKey,
            sourceType: missedSourceType,
            sourceId: medication.id,
          });
          if (enqMissed.created) jobsEnqueued += 1;
        }
      }

      desiredKeysBySource.set(dueSourceKey, dueDesired);
      desiredKeysBySource.set(missedSourceKey, missedDesired);
    }
  }

  // Cancel obsolete pending jobs
  let jobsCancelled = 0;
  for (const [, ] of desiredKeysBySource) {
    // no-op; consumed below
  }
  for (const medication of targetMedications) {
    if (!medication.id) continue;
    for (const recipient of recipients) {
      const dueSourceKey = `${sourceTypeFor('due')}:${recipient.userId}:${medication.id}`;
      const missedSourceKey = `${sourceTypeFor('missed')}:${recipient.userId}:${medication.id}`;
      const dueKeep = desiredKeysBySource.get(dueSourceKey);
      const missedKeep = desiredKeysBySource.get(missedSourceKey);

      jobsCancelled += await cancelPendingJobsForSource(adminClient, {
        sourceType: sourceTypeFor('due'),
        sourceId: medication.id,
        keepDedupeKeys: dueKeep ? Array.from(dueKeep) : [],
      });
      jobsCancelled += await cancelPendingJobsForSource(adminClient, {
        sourceType: sourceTypeFor('missed'),
        sourceId: medication.id,
        keepDedupeKeys: missedKeep ? Array.from(missedKeep) : [],
      });
    }
  }

  return { jobsEnqueued, jobsCancelled, recipients: recipients.length };
};

// Convenience: cancel everything for a deleted medication
export const cancelMedicationSchedule = async (
  adminClient: SupabaseClient,
  medicationId: string
) => {
  const due = await cancelPendingJobsForSource(adminClient, {
    sourceType: sourceTypeFor('due'),
    sourceId: medicationId,
  });
  const missed = await cancelPendingJobsForSource(adminClient, {
    sourceType: sourceTypeFor('missed'),
    sourceId: medicationId,
  });
  return { cancelled: due + missed };
};
