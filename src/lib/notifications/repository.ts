// Database access layer for the canonical notification platform.
// Every write goes through this module so dedupe, idempotency, and field
// validation happen in exactly one place.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isNotificationCategory,
  type CreateNotificationInput,
  type EnqueueJobInput,
  type NotificationCategory,
  type NotificationEndpointRow,
  type NotificationJobRow,
  type NotificationRow,
  type WebPushSubscriptionPayload,
} from './types';

const toIso = (value: string | Date | null | undefined): string | null => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

// Returns the existing row if a duplicate was prevented by the unique
// constraint; otherwise the freshly inserted row.
export const upsertNotification = async (
  adminClient: SupabaseClient,
  input: CreateNotificationInput
): Promise<{ row: NotificationRow; created: boolean }> => {
  if (!isNotificationCategory(input.category)) {
    throw new Error(`Unknown notification category: ${input.category}`);
  }
  if (!input.userId) throw new Error('userId is required');
  if (!input.dedupeKey) throw new Error('dedupeKey is required');
  if (!input.title) throw new Error('title is required');

  const payload = {
    user_id: input.userId,
    profile_id: input.profileId ?? null,
    category: input.category,
    title: input.title,
    body: input.body ?? '',
    metadata: input.metadata ?? {},
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
    dedupe_key: input.dedupeKey,
    priority: typeof input.priority === 'number' ? input.priority : 5,
    deep_link: input.deepLink ?? null,
    scheduled_for: toIso(input.scheduledFor) ?? new Date().toISOString(),
    expires_at: toIso(input.expiresAt ?? null),
  };

  const { data: inserted, error: insertError } = await adminClient
    .from('user_notifications')
    .insert(payload)
    .select('*')
    .single();

  if (!insertError && inserted) {
    return { row: inserted as NotificationRow, created: true };
  }

  // 23505 = unique_violation on (user_id, dedupe_key) — fetch the existing row.
  if (insertError && (insertError as { code?: string }).code === '23505') {
    const { data: existing, error: fetchError } = await adminClient
      .from('user_notifications')
      .select('*')
      .eq('user_id', input.userId)
      .eq('dedupe_key', input.dedupeKey)
      .single();
    if (fetchError) throw fetchError;
    return { row: existing as NotificationRow, created: false };
  }

  throw insertError ?? new Error('Failed to upsert notification');
};

export type ListNotificationsOptions = {
  limit?: number;
  cursorScheduledFor?: string;
  cursorId?: string;
  includeDismissed?: boolean;
  categories?: NotificationCategory[];
};

export const listNotificationsForUser = async (
  adminClient: SupabaseClient,
  userId: string,
  options: ListNotificationsOptions = {}
): Promise<{ rows: NotificationRow[]; nextCursor: { scheduledFor: string; id: string } | null }> => {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  let q = adminClient
    .from('user_notifications')
    .select('*')
    .eq('user_id', userId)
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (!options.includeDismissed) {
    q = q.is('dismissed_at', null);
  }
  // Snoozed rows are filtered client-side in BackendNotificationsSection.
  // (We previously tried a PostgREST `.or()` here, but ISO timestamps in the
  // value confused its parser and silently returned zero rows.)
  if (options.categories?.length) {
    q = q.in('category', options.categories);
  }
  if (options.cursorScheduledFor) {
    q = q.lt('scheduled_for', options.cursorScheduledFor);
  }

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as NotificationRow[];
  const nextCursor =
    rows.length === limit
      ? { scheduledFor: rows[rows.length - 1].scheduled_for, id: rows[rows.length - 1].id }
      : null;
  return { rows, nextCursor };
};

export type StateTransition = {
  read?: boolean;
  dismissed?: boolean;
  acknowledged?: boolean;
  snoozedUntil?: string | Date | null;
};

export const transitionNotificationState = async (
  adminClient: SupabaseClient,
  userId: string,
  notificationId: string,
  transition: StateTransition
): Promise<NotificationRow | null> => {
  const nowIso = new Date().toISOString();
  const updates: Record<string, unknown> = {};
  if (typeof transition.read === 'boolean') {
    updates.read_at = transition.read ? nowIso : null;
  }
  if (typeof transition.dismissed === 'boolean') {
    updates.dismissed_at = transition.dismissed ? nowIso : null;
  }
  if (typeof transition.acknowledged === 'boolean') {
    updates.acknowledged_at = transition.acknowledged ? nowIso : null;
  }
  if (transition.snoozedUntil !== undefined) {
    updates.snoozed_until = toIso(transition.snoozedUntil);
  }
  if (Object.keys(updates).length === 0) return null;

  const { data, error } = await adminClient
    .from('user_notifications')
    .update(updates)
    .eq('id', notificationId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NotificationRow | null;
};

export const transitionManyByDedupeKeyPrefix = async (
  adminClient: SupabaseClient,
  userId: string,
  dedupePrefix: string,
  transition: { dismissed: boolean }
): Promise<number> => {
  const nowIso = new Date().toISOString();
  const { data, error } = await adminClient
    .from('user_notifications')
    .update({ dismissed_at: transition.dismissed ? nowIso : null })
    .eq('user_id', userId)
    .like('dedupe_key', `${dedupePrefix}%`)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
};

// ---------------------------------------------------------------------------
// Endpoints (push subscriptions)
// ---------------------------------------------------------------------------

import { createHash } from 'crypto';

export const hashEndpoint = (endpoint: string) =>
  createHash('sha256').update(endpoint).digest('hex');

export const upsertWebPushEndpoint = async (
  adminClient: SupabaseClient,
  userId: string,
  subscription: WebPushSubscriptionPayload,
  metadata: { userAgent?: string | null; platform?: string | null }
): Promise<NotificationEndpointRow> => {
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error('Invalid web push subscription');
  }
  const endpointHash = hashEndpoint(subscription.endpoint);
  const nowIso = new Date().toISOString();
  const payload = {
    user_id: userId,
    channel: 'web_push' as const,
    endpoint_hash: endpointHash,
    subscription,
    user_agent: metadata.userAgent ?? null,
    platform: metadata.platform ?? null,
    last_seen_at: nowIso,
    disabled_at: null,
    invalidated_at: null,
  };
  const { data, error } = await adminClient
    .from('notification_endpoints')
    .upsert(payload, { onConflict: 'user_id,channel,endpoint_hash' })
    .select('*')
    .single();
  if (error) throw error;
  return data as NotificationEndpointRow;
};

export const markEndpointInvalidated = async (
  adminClient: SupabaseClient,
  endpointId: string,
  reason?: string
): Promise<void> => {
  const { error } = await adminClient
    .from('notification_endpoints')
    .update({ invalidated_at: new Date().toISOString() })
    .eq('id', endpointId);
  if (error) throw error;
  if (reason) {
    // best-effort log
    console.info(`[notifications] invalidated endpoint ${endpointId}: ${reason}`);
  }
};

export const removeEndpointBySubscriptionEndpoint = async (
  adminClient: SupabaseClient,
  userId: string,
  endpointUrl: string
): Promise<number> => {
  const endpointHash = hashEndpoint(endpointUrl);
  const { data, error } = await adminClient
    .from('notification_endpoints')
    .update({ disabled_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('endpoint_hash', endpointHash)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
};

export const listActiveEndpointsForUser = async (
  adminClient: SupabaseClient,
  userId: string,
  channel: 'web_push' | 'fcm' | 'apns' = 'web_push'
): Promise<NotificationEndpointRow[]> => {
  const { data, error } = await adminClient
    .from('notification_endpoints')
    .select('*')
    .eq('user_id', userId)
    .eq('channel', channel)
    .is('invalidated_at', null)
    .is('disabled_at', null);
  if (error) throw error;
  return (data ?? []) as NotificationEndpointRow[];
};

// ---------------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------------

export type DeliveryUpsertInput = {
  notificationId: string;
  endpointId: string | null;
  channel: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped' | 'invalidated';
  attempt?: number;
  attemptedAt?: Date;
  deliveredAt?: Date | null;
  statusCode?: number | null;
  error?: string | null;
  providerResponse?: Record<string, unknown> | null;
};

export const recordDelivery = async (
  adminClient: SupabaseClient,
  input: DeliveryUpsertInput
): Promise<void> => {
  const payload = {
    notification_id: input.notificationId,
    endpoint_id: input.endpointId,
    channel: input.channel,
    status: input.status,
    attempt: input.attempt ?? 1,
    attempted_at: (input.attemptedAt ?? new Date()).toISOString(),
    delivered_at: input.deliveredAt ? input.deliveredAt.toISOString() : null,
    status_code: input.statusCode ?? null,
    error: input.error ?? null,
    provider_response: input.providerResponse ?? null,
  };
  const { error } = await adminClient.from('notification_deliveries').insert(payload);
  if (error) throw error;
};

// ---------------------------------------------------------------------------
// Jobs (scheduling queue)
// ---------------------------------------------------------------------------

export const enqueueJob = async (
  adminClient: SupabaseClient,
  input: EnqueueJobInput
): Promise<{ row: NotificationJobRow; created: boolean }> => {
  const payload = {
    job_type: input.jobType,
    payload: input.payload ?? {},
    run_at: typeof input.runAt === 'string' ? input.runAt : input.runAt.toISOString(),
    state: 'pending' as const,
    attempts: 0,
    max_attempts: input.maxAttempts ?? 5,
    dedupe_key: input.dedupeKey,
    source_type: input.sourceType ?? null,
    source_id: input.sourceId ?? null,
  };
  const { data: inserted, error: insertError } = await adminClient
    .from('notification_jobs')
    .insert(payload)
    .select('*')
    .single();
  if (!insertError && inserted) return { row: inserted as NotificationJobRow, created: true };
  if (insertError && (insertError as { code?: string }).code === '23505') {
    // Already enqueued. Re-fetch and, if it had been cancelled/failed and the
    // new run_at is still in the future, revive it (so reschedules work).
    const { data: existing, error: fetchError } = await adminClient
      .from('notification_jobs')
      .select('*')
      .eq('job_type', input.jobType)
      .eq('dedupe_key', input.dedupeKey)
      .single();
    if (fetchError) throw fetchError;
    const row = existing as NotificationJobRow;
    if (row.state === 'cancelled' || row.state === 'failed') {
      const { data: revived, error: reviveError } = await adminClient
        .from('notification_jobs')
        .update({
          state: 'pending',
          run_at: payload.run_at,
          attempts: 0,
          last_error: null,
          locked_until: null,
          payload: payload.payload,
        })
        .eq('id', row.id)
        .select('*')
        .single();
      if (reviveError) throw reviveError;
      return { row: revived as NotificationJobRow, created: false };
    }
    if (row.state === 'pending' && row.run_at !== payload.run_at) {
      const { data: updated, error: updateError } = await adminClient
        .from('notification_jobs')
        .update({ run_at: payload.run_at, payload: payload.payload })
        .eq('id', row.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      return { row: updated as NotificationJobRow, created: false };
    }
    return { row, created: false };
  }
  throw insertError ?? new Error('Failed to enqueue notification job');
};

export const cancelPendingJobsForSource = async (
  adminClient: SupabaseClient,
  params: { sourceType: string; sourceId: string; keepDedupeKeys?: string[] }
): Promise<number> => {
  let q = adminClient
    .from('notification_jobs')
    .update({ state: 'cancelled', locked_until: null })
    .eq('source_type', params.sourceType)
    .eq('source_id', params.sourceId)
    .eq('state', 'pending')
    .select('id');
  if (params.keepDedupeKeys?.length) {
    // Note: postgrest .not('dedupe_key', 'in', `(${...})`) — escape single quotes.
    const list = params.keepDedupeKeys
      .map((k) => `"${k.replace(/"/g, '\\"')}"`)
      .join(',');
    q = q.not('dedupe_key', 'in', `(${list})`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data?.length ?? 0;
};

export const claimJobs = async (
  adminClient: SupabaseClient,
  workerId: string,
  limit: number
): Promise<NotificationJobRow[]> => {
  const { data, error } = await adminClient.rpc('claim_notification_jobs', {
    p_worker_id: workerId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as NotificationJobRow[];
};

export const completeJob = async (
  adminClient: SupabaseClient,
  jobId: string
): Promise<void> => {
  const { error } = await adminClient
    .from('notification_jobs')
    .update({ state: 'completed', locked_until: null, last_error: null })
    .eq('id', jobId);
  if (error) throw error;
};

export const failJob = async (
  adminClient: SupabaseClient,
  job: NotificationJobRow,
  errorMessage: string,
  retryDelaySeconds: number
): Promise<void> => {
  const exhausted = job.attempts >= job.max_attempts;
  const updates: Record<string, unknown> = {
    state: exhausted ? 'failed' : 'pending',
    last_error: errorMessage.slice(0, 2000),
    locked_until: null,
  };
  if (!exhausted) {
    updates.run_at = new Date(Date.now() + retryDelaySeconds * 1000).toISOString();
  }
  const { error } = await adminClient.from('notification_jobs').update(updates).eq('id', job.id);
  if (error) throw error;
};
