// Drains the notification_jobs queue. Called by /api/cron/notifications.
//
// Two job types are handled here:
//   * materialize_reminder — turn a scheduled reminder payload into a canonical
//     user_notifications row + per-endpoint deliver_push jobs (via dispatch).
//   * deliver_push — actually call the web-push provider for one notification +
//     endpoint pair.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  claimJobs,
  completeJob,
  enqueueJob,
  failJob,
  markEndpointInvalidated,
  recordDelivery,
} from './repository';
import { dispatchNotification } from './dispatch';
import { sendWebPush } from './push';
import { sendExpoPush, fetchExpoReceipts, isExpoPermanentErrorCode } from './expoPush';
import type { PushSendOutcome } from './push';
import {
  isNotificationCategory,
  type NotificationEndpointRow,
  type NotificationJobRow,
  type NotificationRow,
} from './types';
import {
  fetchCareCirclePermissions,
  type CareCirclePermissionKey,
} from '@/lib/careCirclePermissions';
import { ownerUserIdForProfile } from './schedulers/recipients';

// Categories that gate on a care-circle permission when the recipient is NOT
// the profile owner. `care_circle_member_activity` resolves dynamically from
// `metadata.domain` since one category covers vault/medication/appointment.
const CARE_CIRCLE_GATED_PERMISSION = (
  category: string,
  metadata: Record<string, unknown>
): CareCirclePermissionKey | null => {
  switch (category) {
    case 'medication_due':
    case 'medication_missed':
      return 'medications';
    case 'appointment_upcoming':
    case 'appointment_changed':
      return 'appointments';
    case 'vault_document_uploaded':
      return 'vault';
    case 'care_circle_member_activity': {
      const domain = typeof metadata?.domain === 'string' ? metadata.domain : '';
      if (domain === 'vault') return 'vault';
      if (domain === 'medication') return 'medications';
      if (domain === 'appointment') return 'appointments';
      return 'activity_log';
    }
    default:
      return null;
  }
};

// At delivery time, re-confirm the recipient still has the relevant
// care-circle permission. Avoids leaking notifications generated before a
// permission was revoked (or for jobs that sat in the queue across a perm
// change). Returns `{ allowed: false, reason }` if delivery should be skipped.
const checkCareCirclePermissionAtDelivery = async (
  adminClient: SupabaseClient,
  notification: NotificationRow
): Promise<{ allowed: true } | { allowed: false; reason: string }> => {
  const profileId = notification.profile_id;
  if (!profileId) return { allowed: true };

  const metadata = (notification.metadata ?? {}) as Record<string, unknown>;
  const requiredPermission = CARE_CIRCLE_GATED_PERMISSION(notification.category, metadata);
  if (!requiredPermission) return { allowed: true };

  const ownerUserId = await ownerUserIdForProfile(adminClient, profileId);
  if (!ownerUserId) return { allowed: true };
  if (ownerUserId === notification.user_id) return { allowed: true };

  const perms = await fetchCareCirclePermissions(adminClient, ownerUserId, notification.user_id);
  if (perms[requiredPermission]) return { allowed: true };

  return { allowed: false, reason: `permission revoked: ${requiredPermission}` };
};

const RETRY_BACKOFF_SECONDS = (attempt: number) =>
  Math.min(60 * Math.pow(2, attempt), 30 * 60); // 1m, 2m, 4m, ... capped at 30m

const buildDeepLink = (
  category: string,
  metadata: Record<string, unknown>
): string => {
  switch (category) {
    case 'medication_due':
    case 'medication_missed':
      return '/app/homepage?open=medications';
    case 'appointment_upcoming':
    case 'appointment_changed':
      return '/app/homepage?open=calendar';
    case 'care_circle_invite_received':
    case 'care_circle_invite_accepted':
    case 'care_circle_member_activity':
      return '/app/homepage?open=notifications';
    case 'vault_document_uploaded': {
      const folder = typeof metadata?.folder === 'string' ? metadata.folder : '';
      return folder ? `/app/vault?folder=${encodeURIComponent(folder)}` : '/app/vault';
    }
    case 'medical_summary_ready':
      return '/app/homepage';
    default:
      return '/app/homepage';
  }
};

const runMaterializeReminderJob = async (
  adminClient: SupabaseClient,
  job: NotificationJobRow
): Promise<void> => {
  const p = job.payload as Record<string, unknown>;
  const category = String(p.category ?? '');
  if (!isNotificationCategory(category)) {
    throw new Error(`materialize_reminder: unknown category ${category}`);
  }
  const recipientUserId = String(p.recipientUserId ?? '');
  if (!recipientUserId) throw new Error('materialize_reminder: missing recipientUserId');
  const dedupeKey = String(p.dedupeKey ?? job.dedupe_key);

  let title = '';
  let body = '';
  const metadata: Record<string, unknown> = { ...p };

  if (category === 'medication_due') {
    const name = String(p.medicationName ?? 'Medication');
    const dosage = p.dosage ? ` · ${String(p.dosage)}` : '';
    const ctx = p.slotContext ? ` (${String(p.slotContext)})` : '';
    title = 'Medication due now';
    body = `${name}${dosage}${ctx}`;
  } else if (category === 'medication_missed') {
    const name = String(p.medicationName ?? 'Medication');
    const ctx = p.slotContext ? ` (${String(p.slotContext)})` : '';
    title = 'Medication missed';
    body = `${name}${ctx} was not logged within the reminder window.`;
  } else if (category === 'appointment_upcoming') {
    const stageLabel = (() => {
      switch (String(p.stage)) {
        case '24h':
          return 'within 24 hours';
        case '2h':
          return 'in 2 hours';
        case '30m':
          return 'in 30 minutes';
        default:
          return 'soon';
      }
    })();
    title = 'Upcoming appointment';
    body = `${String(p.appointmentTitle ?? 'Appointment')} ${stageLabel}.`;
  } else {
    title = `Reminder: ${category}`;
    body = '';
  }

  await dispatchNotification(adminClient, {
    userId: recipientUserId,
    profileId: typeof p.profileId === 'string' ? p.profileId : null,
    category,
    title,
    body,
    metadata,
    sourceType: typeof p.sourceType === 'string' ? p.sourceType : job.source_type ?? null,
    sourceId: typeof p.sourceId === 'string' ? p.sourceId : job.source_id ?? null,
    dedupeKey,
    deepLink: buildDeepLink(category, metadata),
    scheduledFor: typeof p.scheduledFor === 'string' ? p.scheduledFor : new Date().toISOString(),
  });
};

// Shared logic for any per-endpoint delivery job (web push, expo push, ...).
// Loads the notification + endpoint, runs all the gating checks (deleted,
// disabled, dismissed, snoozed, care-circle perms), then delegates to the
// transport-specific sender.
const runDeliveryJob = async (
  adminClient: SupabaseClient,
  job: NotificationJobRow,
  send: (
    endpoint: NotificationEndpointRow,
    notification: NotificationRow
  ) => Promise<PushSendOutcome>
): Promise<void> => {
  const notificationId = String((job.payload as Record<string, unknown>).notificationId ?? '');
  const endpointId = String((job.payload as Record<string, unknown>).endpointId ?? '');
  if (!notificationId || !endpointId) {
    throw new Error(`${job.job_type}: missing notificationId or endpointId`);
  }

  const [{ data: notification, error: notifErr }, { data: endpoint, error: epErr }] = await Promise.all([
    adminClient.from('user_notifications').select('*').eq('id', notificationId).maybeSingle(),
    adminClient.from('notification_endpoints').select('*').eq('id', endpointId).maybeSingle(),
  ]);
  if (notifErr) throw notifErr;
  if (epErr) throw epErr;
  if (!notification) {
    // Notification was deleted between enqueue and now — succeed silently.
    return;
  }
  if (!endpoint) {
    return; // endpoint deleted — nothing to deliver to
  }
  if (endpoint.invalidated_at || endpoint.disabled_at) {
    await recordDelivery(adminClient, {
      notificationId,
      endpointId,
      channel: endpoint.channel,
      status: 'skipped',
      attempt: job.attempts,
      error: endpoint.invalidated_at ? 'endpoint invalidated' : 'endpoint disabled',
    });
    return;
  }

  // Respect dismissed/snoozed state recorded after the job was enqueued. The
  // user already acted on the in-app row — don't shove a push at them too.
  if (notification.dismissed_at) {
    await recordDelivery(adminClient, {
      notificationId,
      endpointId,
      channel: endpoint.channel,
      status: 'skipped',
      attempt: job.attempts,
      error: 'notification dismissed',
    });
    return;
  }
  if (notification.snoozed_until) {
    const snoozeMs = new Date(notification.snoozed_until).getTime();
    if (Number.isFinite(snoozeMs) && snoozeMs > Date.now()) {
      await recordDelivery(adminClient, {
        notificationId,
        endpointId,
        channel: endpoint.channel,
        status: 'skipped',
        attempt: job.attempts,
        error: 'notification snoozed',
      });
      return;
    }
  }

  const permissionCheck = await checkCareCirclePermissionAtDelivery(
    adminClient,
    notification as NotificationRow
  );
  if (!permissionCheck.allowed) {
    await recordDelivery(adminClient, {
      notificationId,
      endpointId,
      channel: endpoint.channel,
      status: 'skipped',
      attempt: job.attempts,
      error: permissionCheck.reason,
    });
    return;
  }

  const outcome = await send(endpoint as NotificationEndpointRow, notification as NotificationRow);
  await recordDelivery(adminClient, {
    notificationId,
    endpointId,
    channel: endpoint.channel,
    status:
      outcome.kind === 'sent'
        ? 'sent'
        : outcome.kind === 'invalidated'
          ? 'invalidated'
          : 'failed',
    attempt: job.attempts,
    attemptedAt: new Date(),
    deliveredAt: outcome.kind === 'sent' ? new Date() : null,
    statusCode: outcome.kind === 'sent' ? outcome.statusCode : outcome.statusCode ?? null,
    error: outcome.kind === 'sent' ? null : outcome.reason,
    providerResponse: outcome.kind === 'sent' ? outcome.providerResponse ?? null : null,
  });

  if (outcome.kind === 'invalidated') {
    await markEndpointInvalidated(adminClient, endpointId, outcome.reason);
    return;
  }
  if (outcome.kind === 'failed') {
    throw new Error(outcome.reason);
  }

  // For Expo: schedule a receipts check ~15 min later so we can catch
  // late-stage failures (e.g. DeviceNotRegistered surfaced only via receipt).
  if (
    outcome.kind === 'sent' &&
    endpoint.channel === 'expo' &&
    typeof outcome.providerResponse?.expo_ticket_id === 'string'
  ) {
    const ticketId = outcome.providerResponse.expo_ticket_id;
    await enqueueJob(adminClient, {
      jobType: 'check_expo_receipts',
      payload: { ticketId, endpointId, notificationId },
      runAt: new Date(Date.now() + 15 * 60 * 1000),
      dedupeKey: `expo_receipt:${ticketId}`,
      sourceType: 'notification',
      sourceId: notificationId,
      maxAttempts: 4,
    });
  }
};

const runDeliverPushJob = (adminClient: SupabaseClient, job: NotificationJobRow) =>
  runDeliveryJob(adminClient, job, sendWebPush);

const runDeliverExpoPushJob = (adminClient: SupabaseClient, job: NotificationJobRow) =>
  runDeliveryJob(adminClient, job, sendExpoPush);

// Polls EPS for the receipt of a previously-sent ticket. Surfaces late-stage
// failures that the initial /push/send call couldn't see (APNs/FCM eventually
// reports DeviceNotRegistered, MessageRateExceeded, etc.). On a permanent
// error, mark the endpoint invalidated so the queue stops targeting it.
const runCheckExpoReceiptsJob = async (
  adminClient: SupabaseClient,
  job: NotificationJobRow
): Promise<void> => {
  const p = job.payload as Record<string, unknown>;
  const ticketId = typeof p.ticketId === 'string' ? p.ticketId : '';
  const endpointId = typeof p.endpointId === 'string' ? p.endpointId : '';
  const notificationId = typeof p.notificationId === 'string' ? p.notificationId : '';
  if (!ticketId || !endpointId) {
    throw new Error('check_expo_receipts: missing ticketId or endpointId');
  }

  const receipts = await fetchExpoReceipts([ticketId]);
  const receipt = receipts[ticketId];

  // No receipt yet — EPS may not have one for ~15 min after send. Re-queue a
  // little later (the failJob path does the right backoff if we throw).
  if (!receipt) {
    throw new Error(`receipt not yet available for ticket ${ticketId}`);
  }

  if (receipt.status === 'ok') {
    // Confirmed delivered. Nothing to do.
    return;
  }

  const errCode = receipt.details?.error;
  const reason = `${errCode ?? 'EPS receipt error'}: ${receipt.message ?? ''}`.trim();

  // Always log the receipt-side failure as a follow-up delivery row so the
  // audit trail captures it (the original 'sent' row stays as-is).
  await recordDelivery(adminClient, {
    notificationId,
    endpointId,
    channel: 'expo',
    status: isExpoPermanentErrorCode(errCode) ? 'invalidated' : 'failed',
    attempt: job.attempts,
    attemptedAt: new Date(),
    error: reason,
    providerResponse: { expo_ticket_id: ticketId, receipt },
  });

  if (isExpoPermanentErrorCode(errCode)) {
    await markEndpointInvalidated(adminClient, endpointId, reason);
  }
};

export type DrainJobsOutcome = {
  claimed: number;
  completed: number;
  failed: number;
  perJob: Array<{ jobId: string; jobType: string; ok: boolean; error?: string }>;
};

export const drainNotificationJobs = async (
  adminClient: SupabaseClient,
  options: { workerId: string; limit?: number } = { workerId: 'cron' }
): Promise<DrainJobsOutcome> => {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const claimed = await claimJobs(adminClient, options.workerId, limit);
  const out: DrainJobsOutcome = {
    claimed: claimed.length,
    completed: 0,
    failed: 0,
    perJob: [],
  };

  for (const job of claimed) {
    try {
      switch (job.job_type) {
        case 'materialize_reminder':
          await runMaterializeReminderJob(adminClient, job);
          break;
        case 'deliver_push':
          await runDeliverPushJob(adminClient, job);
          break;
        case 'deliver_expo_push':
          await runDeliverExpoPushJob(adminClient, job);
          break;
        case 'check_expo_receipts':
          await runCheckExpoReceiptsJob(adminClient, job);
          break;
        case 'reconcile':
          // Reserved for nightly horizon extension. No-op for now; the cron
          // tick keeps queues warm via emitter-driven reconciliations.
          break;
        default:
          throw new Error(`Unknown job_type: ${job.job_type}`);
      }
      await completeJob(adminClient, job.id);
      out.completed += 1;
      out.perJob.push({ jobId: job.id, jobType: job.job_type, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const backoff = RETRY_BACKOFF_SECONDS(job.attempts);
      try {
        await failJob(adminClient, job, message, backoff);
      } catch (failErr) {
        console.error(`[notifications] failed to record job failure for ${job.id}:`, failErr);
      }
      out.failed += 1;
      out.perJob.push({ jobId: job.id, jobType: job.job_type, ok: false, error: message });
    }
  }
  return out;
};
