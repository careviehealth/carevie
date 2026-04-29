// Canonical notification platform types. Shared between server libs, API
// routes, schedulers, the dispatcher, and the in-app panel.

export const NOTIFICATION_CATEGORIES = [
  'medication_due',
  'medication_missed',
  'appointment_upcoming',
  'appointment_changed',
  'care_circle_invite_received',
  'care_circle_invite_accepted',
  'care_circle_member_activity',
  'vault_document_uploaded',
  'medical_summary_ready',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const isNotificationCategory = (value: unknown): value is NotificationCategory =>
  typeof value === 'string' &&
  (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);

export const NOTIFICATION_CHANNELS = ['web_push', 'fcm', 'apns', 'expo', 'in_app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type NotificationStateAction = 'read' | 'unread' | 'dismissed' | 'undismissed' | 'acknowledged' | 'snoozed';

export type NotificationRow = {
  id: string;
  user_id: string;
  profile_id: string | null;
  category: NotificationCategory;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  source_type: string | null;
  source_id: string | null;
  dedupe_key: string;
  priority: number;
  deep_link: string | null;
  scheduled_for: string;
  expires_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  acknowledged_at: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationPreferencesRow = {
  user_id: string;
  timezone: string;
  channel_web_push: boolean;
  channel_in_app: boolean;
  channel_mobile_push: boolean;
  category_prefs: Partial<Record<NotificationCategory, boolean>>;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationEndpointRow = {
  id: string;
  user_id: string;
  channel: 'web_push' | 'fcm' | 'apns' | 'expo';
  endpoint_hash: string;
  subscription: WebPushSubscriptionPayload | ExpoPushSubscriptionPayload | Record<string, unknown>;
  user_agent: string | null;
  platform: string | null;
  last_seen_at: string;
  disabled_at: string | null;
  invalidated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WebPushSubscriptionPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
};

// Expo Push Service token payload. The token alone is sufficient to deliver,
// but we also persist the deviceId so the user can identify rows in a
// "registered devices" UI and revoke them per-device.
export type ExpoPushSubscriptionPayload = {
  expoPushToken: string;
  deviceId: string;
  appVersion?: string | null;
};

export type CreateNotificationInput = {
  userId: string;
  profileId?: string | null;
  category: NotificationCategory;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  sourceType?: string | null;
  sourceId?: string | null;
  dedupeKey: string;
  priority?: number;
  deepLink?: string | null;
  scheduledFor?: string | Date;
  expiresAt?: string | Date | null;
};

export type NotificationJobRow = {
  id: string;
  job_type:
    | 'materialize_reminder'
    | 'deliver_push'
    | 'deliver_expo_push'
    | 'check_expo_receipts'
    | 'reconcile';
  payload: Record<string, unknown>;
  run_at: string;
  state: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  attempts: number;
  max_attempts: number;
  locked_until: string | null;
  worker_id: string | null;
  dedupe_key: string;
  source_type: string | null;
  source_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type EnqueueJobInput = {
  jobType: NotificationJobRow['job_type'];
  payload: Record<string, unknown>;
  runAt: Date | string;
  dedupeKey: string;
  sourceType?: string | null;
  sourceId?: string | null;
  maxAttempts?: number;
};
