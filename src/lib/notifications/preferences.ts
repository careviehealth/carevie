import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isNotificationCategory,
  type NotificationCategory,
  type NotificationPreferencesRow,
} from './types';
import { isInQuietHours, safeTimeZone } from './timezone';

export const DEFAULT_PREFERENCES: Omit<NotificationPreferencesRow, 'user_id' | 'created_at' | 'updated_at'> = {
  timezone: 'UTC',
  channel_web_push: true,
  channel_in_app: true,
  channel_mobile_push: true,
  category_prefs: {},
  quiet_hours_start: null,
  quiet_hours_end: null,
};

export const sanitizeCategoryPrefs = (
  input: unknown
): Partial<Record<NotificationCategory, boolean>> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: Partial<Record<NotificationCategory, boolean>> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isNotificationCategory(key) && typeof value === 'boolean') {
      out[key] = value;
    }
  }
  return out;
};

export const getOrInitPreferences = async (
  adminClient: SupabaseClient,
  userId: string
): Promise<NotificationPreferencesRow> => {
  const { data, error } = await adminClient
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (data) return data as NotificationPreferencesRow;
  // No row yet — return synthetic defaults without inserting (avoid creating
  // rows for users who never enabled notifications).
  const nowIso = new Date().toISOString();
  return {
    user_id: userId,
    ...DEFAULT_PREFERENCES,
    created_at: nowIso,
    updated_at: nowIso,
  };
};

export type PreferencesUpdateInput = {
  timezone?: string;
  channel_web_push?: boolean;
  channel_in_app?: boolean;
  channel_mobile_push?: boolean;
  category_prefs?: Partial<Record<NotificationCategory, boolean>>;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
};

export const upsertPreferences = async (
  adminClient: SupabaseClient,
  userId: string,
  input: PreferencesUpdateInput
): Promise<NotificationPreferencesRow> => {
  const existing = await getOrInitPreferences(adminClient, userId);
  const merged: Omit<NotificationPreferencesRow, 'created_at' | 'updated_at'> = {
    user_id: userId,
    timezone: safeTimeZone(input.timezone ?? existing.timezone),
    channel_web_push:
      typeof input.channel_web_push === 'boolean' ? input.channel_web_push : existing.channel_web_push,
    channel_in_app:
      typeof input.channel_in_app === 'boolean' ? input.channel_in_app : existing.channel_in_app,
    channel_mobile_push:
      typeof input.channel_mobile_push === 'boolean'
        ? input.channel_mobile_push
        : existing.channel_mobile_push,
    category_prefs: {
      ...existing.category_prefs,
      ...sanitizeCategoryPrefs(input.category_prefs ?? {}),
    },
    quiet_hours_start:
      input.quiet_hours_start === undefined ? existing.quiet_hours_start : input.quiet_hours_start,
    quiet_hours_end:
      input.quiet_hours_end === undefined ? existing.quiet_hours_end : input.quiet_hours_end,
  };

  const { data, error } = await adminClient
    .from('user_notification_preferences')
    .upsert(merged, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data as NotificationPreferencesRow;
};

export const isCategoryAllowed = (
  prefs: NotificationPreferencesRow,
  category: NotificationCategory
): boolean => {
  // category_prefs only stores explicit overrides. Default = enabled.
  const value = prefs.category_prefs[category];
  return value === undefined ? true : value === true;
};

export const isChannelAllowed = (
  prefs: NotificationPreferencesRow,
  channel: 'web_push' | 'in_app' | 'mobile_push'
): boolean => {
  if (channel === 'web_push') return prefs.channel_web_push;
  if (channel === 'mobile_push') return prefs.channel_mobile_push;
  return prefs.channel_in_app;
};

export const isQuietHoursActive = (prefs: NotificationPreferencesRow, at: Date): boolean =>
  isInQuietHours(at, prefs.timezone, prefs.quiet_hours_start, prefs.quiet_hours_end);
