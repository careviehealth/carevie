// Single entry point for "I want to notify this user about X."
// Handles:
//   * preference + quiet-hours check
//   * idempotent canonical row creation
//   * enqueueing per-endpoint push deliveries
//
// All call sites (care-circle emitters, schedulers, ad-hoc backend events)
// should go through `dispatchNotification`.

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  enqueueJob,
  listActiveEndpointsForUser,
  recordDelivery,
  upsertNotification,
} from './repository';
import {
  getOrInitPreferences,
  isCategoryAllowed,
  isChannelAllowed,
  isQuietHoursActive,
} from './preferences';
import type {
  CreateNotificationInput,
  NotificationCategory,
  NotificationRow,
} from './types';

type ChannelDispatchStatus = 'queued' | 'skipped' | 'no_endpoints';

export type DispatchResult = {
  notification: NotificationRow | null;
  created: boolean;
  channels: {
    in_app: boolean;
    web_push: ChannelDispatchStatus;
    mobile_push: ChannelDispatchStatus;
  };
  reason?: string;
};

const QUIET_HOURS_BYPASS_CATEGORIES: Set<NotificationCategory> = new Set([
  // High-urgency events that should still ping the user. Future entries (e.g.
  // 'medication_critical') can be added here without touching call sites.
  'medication_missed',
]);

export const dispatchNotification = async (
  adminClient: SupabaseClient,
  input: CreateNotificationInput
): Promise<DispatchResult> => {
  const prefs = await getOrInitPreferences(adminClient, input.userId);

  if (!isCategoryAllowed(prefs, input.category)) {
    return {
      notification: null,
      created: false,
      channels: { in_app: false, web_push: 'skipped', mobile_push: 'skipped' },
      reason: 'category_disabled_by_user',
    };
  }

  // In-app is the canonical record; we always create it unless the user has
  // disabled in-app entirely. (Push without an in-app row would mean no
  // history in the bell panel.)
  if (!isChannelAllowed(prefs, 'in_app')) {
    return {
      notification: null,
      created: false,
      channels: { in_app: false, web_push: 'skipped', mobile_push: 'skipped' },
      reason: 'in_app_channel_disabled',
    };
  }

  const { row, created } = await upsertNotification(adminClient, input);

  const inQuiet = isQuietHoursActive(prefs, new Date(row.scheduled_for));
  const allowDuringQuiet = QUIET_HOURS_BYPASS_CATEGORIES.has(input.category);
  const quietHoursBlock = inQuiet && !allowDuringQuiet;

  // Web push delivery
  let webPushChannelStatus: ChannelDispatchStatus = 'skipped';
  if (isChannelAllowed(prefs, 'web_push') && !quietHoursBlock) {
    const endpoints = await listActiveEndpointsForUser(adminClient, input.userId, 'web_push');
    if (endpoints.length === 0) {
      webPushChannelStatus = 'no_endpoints';
    } else {
      await Promise.all(
        endpoints.map(async (endpoint) => {
          await enqueueJob(adminClient, {
            jobType: 'deliver_push',
            payload: {
              notificationId: row.id,
              endpointId: endpoint.id,
            },
            runAt: new Date(),
            dedupeKey: `push:${row.id}:${endpoint.id}`,
            sourceType: 'notification',
            sourceId: row.id,
            maxAttempts: 5,
          });
          await recordDelivery(adminClient, {
            notificationId: row.id,
            endpointId: endpoint.id,
            channel: 'web_push',
            status: 'pending',
            attempt: 0,
          });
        })
      );
      webPushChannelStatus = 'queued';
    }
  }

  // Mobile push (Expo) delivery — same rules as web push, separate endpoints
  // and separate user pref toggle.
  let mobilePushChannelStatus: ChannelDispatchStatus = 'skipped';
  if (isChannelAllowed(prefs, 'mobile_push') && !quietHoursBlock) {
    const expoEndpoints = await listActiveEndpointsForUser(adminClient, input.userId, 'expo');
    if (expoEndpoints.length === 0) {
      mobilePushChannelStatus = 'no_endpoints';
    } else {
      await Promise.all(
        expoEndpoints.map(async (endpoint) => {
          await enqueueJob(adminClient, {
            jobType: 'deliver_expo_push',
            payload: {
              notificationId: row.id,
              endpointId: endpoint.id,
            },
            runAt: new Date(),
            dedupeKey: `expopush:${row.id}:${endpoint.id}`,
            sourceType: 'notification',
            sourceId: row.id,
            maxAttempts: 5,
          });
          await recordDelivery(adminClient, {
            notificationId: row.id,
            endpointId: endpoint.id,
            channel: 'expo',
            status: 'pending',
            attempt: 0,
          });
        })
      );
      mobilePushChannelStatus = 'queued';
    }
  }

  return {
    notification: row,
    created,
    channels: {
      in_app: true,
      web_push: webPushChannelStatus,
      mobile_push: mobilePushChannelStatus,
    },
  };
};
