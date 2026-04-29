// VAPID-based Web Push delivery. The `web-push` library is loaded lazily so
// the rest of the system (in-app feed, scheduling, preferences) keeps building
// even before the dependency is installed. See docs/notifications.md for setup.

import type { NotificationEndpointRow, NotificationRow } from './types';

type WebPushModule = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options?: { TTL?: number; topic?: string; urgency?: string }
  ) => Promise<{ statusCode?: number; body?: string; headers?: Record<string, string> }>;
  WebPushError: new (...args: unknown[]) => Error & {
    statusCode?: number;
    body?: string;
    headers?: Record<string, string>;
    endpoint?: string;
  };
};

let cachedWebPush: WebPushModule | null = null;
let lastVapidConfigKey = '';

const loadWebPush = async (): Promise<WebPushModule | null> => {
  if (cachedWebPush) {
    ensureVapidConfigured(cachedWebPush);
    return cachedWebPush;
  }
  try {
    // Dynamic import keeps web-push out of the client/edge bundle and lets the
    // app build before the dep is installed.
    const mod = (await import('web-push')) as unknown as WebPushModule | { default: WebPushModule };
    cachedWebPush = ('default' in mod ? mod.default : mod) as WebPushModule;
    ensureVapidConfigured(cachedWebPush);
    return cachedWebPush;
  } catch (err) {
    console.warn(
      '[notifications] web-push module not available (run `npm install web-push @types/web-push`):',
      (err as Error).message
    );
    return null;
  }
};

const ensureVapidConfigured = (mod: WebPushModule) => {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return;
  const configKey = `${subject}::${publicKey}::${privateKey}`;
  if (configKey === lastVapidConfigKey) return;
  mod.setVapidDetails(subject, publicKey, privateKey);
  lastVapidConfigKey = configKey;
};

export const isPushConfigured = () =>
  Boolean(
    process.env.VAPID_SUBJECT &&
      (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) &&
      process.env.VAPID_PRIVATE_KEY
  );

export const getPublicVapidKey = () =>
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? null;

export type PushSendOutcome =
  | { kind: 'sent'; statusCode: number; providerResponse?: Record<string, unknown> }
  | { kind: 'invalidated'; statusCode: number; reason: string }
  | { kind: 'failed'; statusCode: number | null; reason: string };

export const buildPushPayload = (notification: NotificationRow) => ({
  id: notification.id,
  category: notification.category,
  title: notification.title,
  body: notification.body,
  url: notification.deep_link ?? '/app/homepage',
  metadata: notification.metadata ?? {},
  scheduled_for: notification.scheduled_for,
});

export const sendWebPush = async (
  endpoint: NotificationEndpointRow,
  notification: NotificationRow
): Promise<PushSendOutcome> => {
  if (!isPushConfigured()) {
    return { kind: 'failed', statusCode: null, reason: 'VAPID env vars are not configured' };
  }
  const mod = await loadWebPush();
  if (!mod) {
    return { kind: 'failed', statusCode: null, reason: 'web-push module is not installed' };
  }
  const sub = endpoint.subscription as { endpoint: string; keys: { p256dh: string; auth: string } };
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return { kind: 'invalidated', statusCode: 400, reason: 'Endpoint subscription is malformed' };
  }
  try {
    const res = await mod.sendNotification(sub, JSON.stringify(buildPushPayload(notification)), {
      TTL: 60 * 60 * 24,
      urgency: notification.priority <= 2 ? 'high' : 'normal',
      topic: notification.dedupe_key.slice(0, 32),
    });
    return { kind: 'sent', statusCode: res?.statusCode ?? 201 };
  } catch (err) {
    const e = err as Error & { statusCode?: number; body?: string };
    const status = e.statusCode ?? null;
    if (status === 404 || status === 410) {
      return { kind: 'invalidated', statusCode: status, reason: e.body ?? 'Subscription gone' };
    }
    return {
      kind: 'failed',
      statusCode: status,
      reason: e.body ?? e.message ?? 'Unknown push error',
    };
  }
};
