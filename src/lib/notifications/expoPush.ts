// Expo Push Service (EPS) delivery. Mirrors the contract of sendWebPush so the
// jobRunner can treat both transports symmetrically.
//
// EPS is a fan-out relay: we POST a single message to https://exp.host/.../send
// and Expo dispatches to APNs (iOS) or FCM (Android) based on the token format.
// EPS supports batching up to 100 messages per request and rate-limits at
// ~600/sec across an Expo project — we send one at a time per job, which fits
// well within those limits given our queue is per-endpoint.
//
// Two phases of error reporting from EPS:
//   1. Tickets (in the response to /push/send) — surface immediate per-message
//      errors. We act on them here.
//   2. Receipts (fetched later via /push/getReceipts) — surface delivery
//      failures from APNs/FCM. Receipt polling is implemented in step 5
//      (check_expo_receipts job).

import type { NotificationEndpointRow, NotificationRow } from './types';
import type { PushSendOutcome } from './push';

const EPS_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EPS_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

type ExpoTicket =
  | { id?: string; status: 'ok' }
  | {
      status: 'error';
      message?: string;
      details?: { error?: string };
    };

export type ExpoReceipt =
  | { status: 'ok' }
  | { status: 'error'; message?: string; details?: { error?: string } };

type ExpoSendResponse = {
  data?: ExpoTicket | ExpoTicket[];
  errors?: Array<{ code?: string; message?: string }>;
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
  badge?: number;
  ttl?: number;
  // iOS only
  _category?: string;
  // iOS 15+ interruption level. Maps loosely to web push 'urgency'.
  interruptionLevel?: 'passive' | 'active' | 'time-sensitive' | 'critical';
};

const buildExpoMessage = (
  endpoint: NotificationEndpointRow,
  notification: NotificationRow
): ExpoMessage | null => {
  const sub = endpoint.subscription as { expoPushToken?: string };
  const token = sub?.expoPushToken;
  if (!token || typeof token !== 'string') return null;

  const isHighPriority = notification.priority <= 2;

  return {
    to: token,
    title: notification.title,
    body: notification.body,
    data: {
      // Mobile uses these to deep-link and reconcile with the bell panel.
      notification_id: notification.id,
      category: notification.category,
      url: notification.deep_link ?? '/home',
      metadata: notification.metadata ?? {},
      scheduled_for: notification.scheduled_for,
    },
    sound: 'default',
    priority: isHighPriority ? 'high' : 'default',
    interruptionLevel: isHighPriority ? 'time-sensitive' : 'active',
    // Android: route through a per-category channel (created on the device).
    channelId: notification.category,
    ttl: 60 * 60 * 24,
  };
};

const callExpoSend = async (message: ExpoMessage): Promise<ExpoSendResponse | null> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  // Optional. When set, EPS validates the request against your Expo account
  // and unlocks "enhanced security" (signed receipts). Not required.
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }
  const res = await fetch(EPS_SEND_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Expo push HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json().catch(() => null)) as ExpoSendResponse | null;
  return json;
};

// EPS error codes that mean "this token will never work again" — invalidate
// the endpoint so the queue stops targeting it.
const PERMANENT_ERROR_CODES = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
]);

// Same set applies to receipt errors (the codes are identical between tickets
// and receipts).
export const isExpoPermanentErrorCode = (code: string | null | undefined): boolean =>
  Boolean(code && PERMANENT_ERROR_CODES.has(code));

export const fetchExpoReceipts = async (
  ticketIds: string[]
): Promise<Record<string, ExpoReceipt>> => {
  if (ticketIds.length === 0) return {};
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }
  const res = await fetch(EPS_RECEIPTS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids: ticketIds }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Expo receipts HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json().catch(() => null)) as
    | { data?: Record<string, ExpoReceipt> }
    | null;
  return json?.data ?? {};
};

export const sendExpoPush = async (
  endpoint: NotificationEndpointRow,
  notification: NotificationRow
): Promise<PushSendOutcome> => {
  const message = buildExpoMessage(endpoint, notification);
  if (!message) {
    return {
      kind: 'invalidated',
      statusCode: 400,
      reason: 'Endpoint subscription is missing expoPushToken',
    };
  }

  let response: ExpoSendResponse | null;
  try {
    response = await callExpoSend(message);
  } catch (err) {
    return {
      kind: 'failed',
      statusCode: null,
      reason: err instanceof Error ? err.message : 'Unknown EPS error',
    };
  }

  if (!response) {
    return { kind: 'failed', statusCode: null, reason: 'Empty response from Expo push' };
  }

  if (response.errors?.length) {
    const first = response.errors[0];
    return {
      kind: 'failed',
      statusCode: null,
      reason: `EPS error: ${first?.code ?? 'unknown'} ${first?.message ?? ''}`.trim(),
    };
  }

  const tickets = Array.isArray(response.data) ? response.data : response.data ? [response.data] : [];
  const ticket = tickets[0];
  if (!ticket) {
    return { kind: 'failed', statusCode: null, reason: 'EPS returned no ticket' };
  }

  if (ticket.status === 'ok') {
    // Expose the ticket id so the caller can enqueue a receipts-check job.
    // EPS retains receipts for ~24h; we poll ~15min later to catch late-stage
    // delivery failures (e.g. DeviceNotRegistered surfaced only via receipt).
    return {
      kind: 'sent',
      statusCode: 200,
      providerResponse: ticket.id ? { expo_ticket_id: ticket.id } : undefined,
    };
  }

  const errCode = ticket.details?.error;
  const reason = `${errCode ?? 'EPS error'}: ${ticket.message ?? ''}`.trim();
  if (errCode && PERMANENT_ERROR_CODES.has(errCode)) {
    return { kind: 'invalidated', statusCode: 200, reason };
  }
  return { kind: 'failed', statusCode: 200, reason };
};
