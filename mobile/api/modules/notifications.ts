// Backend calls for the mobile notification platform. Symmetric to the web
// app's /api/notifications/push/expo/* and /api/notifications/preferences routes.

import { apiRequest } from '@/api/client';

type SubscribeBody = {
  expoPushToken: string;
  deviceId: string;
  platform: string | null;
  appVersion: string | null;
};

type SubscribeResponse = {
  endpoint: { id: string; channel: string; last_seen_at: string };
};

export type ExpoEndpointSummary = {
  id: string;
  platform: string | null;
  appVersion: string | null;
  deviceId: string | null;
  expoPushToken: string | null;
  lastSeenAt: string;
  createdAt: string;
};

export type NotificationPreferences = {
  user_id: string;
  timezone: string;
  channel_web_push: boolean;
  channel_in_app: boolean;
  channel_mobile_push: boolean;
  category_prefs: Record<string, boolean>;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  created_at: string;
  updated_at: string;
};

export type PreferencesUpdateBody = Partial<{
  timezone: string;
  channel_web_push: boolean;
  channel_in_app: boolean;
  channel_mobile_push: boolean;
  category_prefs: Record<string, boolean>;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}>;

export const subscribeExpoPushToken = (body: SubscribeBody) =>
  apiRequest<SubscribeResponse>('/api/notifications/push/expo/subscribe', {
    method: 'POST',
    body,
  });

export const unsubscribeExpoPushToken = (expoPushToken: string) =>
  apiRequest<{ removed: number }>('/api/notifications/push/expo/unsubscribe', {
    method: 'POST',
    body: { expoPushToken },
  });

export const listExpoEndpoints = () =>
  apiRequest<{ endpoints: ExpoEndpointSummary[] }>('/api/notifications/push/expo/list', {
    method: 'GET',
  });

export const fetchNotificationPreferences = () =>
  apiRequest<{ preferences: NotificationPreferences }>('/api/notifications/preferences', {
    method: 'GET',
  });

export const updateNotificationPreferences = (body: PreferencesUpdateBody) =>
  apiRequest<{ preferences: NotificationPreferences }>('/api/notifications/preferences', {
    method: 'PUT',
    body,
  });
