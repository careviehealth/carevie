// Install the foreground handler + Android notification channels exactly once
// per process. Channels give users OS-level per-category mute control that
// mirrors the in-app category_prefs toggles.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { routeForNotification, type MobilePushData } from '@/lib/notificationRouting';

// Readable channel metadata. Keep the ids exactly equal to the backend
// NotificationCategory values — the server sets channelId = notification.category
// in expoPush.ts.
type ChannelDef = {
  id: string;
  name: string;
  description: string;
  importance: Notifications.AndroidImportance;
};

const ANDROID_CHANNELS: ChannelDef[] = [
  {
    id: 'medication_due',
    name: 'Medication reminders',
    description: 'Alerts when a medication is due to be taken.',
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    id: 'medication_missed',
    name: 'Missed medications',
    description: 'Alerts when a scheduled medication has not been logged.',
    importance: Notifications.AndroidImportance.HIGH,
  },
  {
    id: 'appointment_upcoming',
    name: 'Upcoming appointments',
    description: 'Reminders ahead of scheduled appointments.',
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  {
    id: 'appointment_changed',
    name: 'Appointment changes',
    description: 'Alerts when an appointment is added, rescheduled, or cancelled.',
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  {
    id: 'care_circle_invite_received',
    name: 'Care circle invitations',
    description: 'Someone invited you to join their care circle.',
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  {
    id: 'care_circle_invite_accepted',
    name: 'Care circle acceptances',
    description: 'Someone accepted your care circle invitation.',
    importance: Notifications.AndroidImportance.DEFAULT,
  },
  {
    id: 'care_circle_member_activity',
    name: 'Care circle activity',
    description: 'Activity from people in your care circle.',
    importance: Notifications.AndroidImportance.LOW,
  },
  {
    id: 'vault_document_uploaded',
    name: 'Vault documents',
    description: 'New documents uploaded to your health vault.',
    importance: Notifications.AndroidImportance.LOW,
  },
  {
    id: 'medical_summary_ready',
    name: 'Medical summaries',
    description: 'Your medical summary is ready to view.',
    importance: Notifications.AndroidImportance.DEFAULT,
  },
];

let handlerInstalled = false;
let channelsCreated = false;

export const installForegroundHandler = () => {
  if (handlerInstalled) return;
  handlerInstalled = true;
  // Show banner + sound + update badge when a push arrives while the app is
  // foregrounded. Without this handler, Expo silently drops the notification
  // UI when the app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
};

export const ensureAndroidChannels = async () => {
  if (channelsCreated) return;
  if (Platform.OS !== 'android') {
    channelsCreated = true;
    return;
  }
  try {
    await Promise.all(
      ANDROID_CHANNELS.map((def) =>
        Notifications.setNotificationChannelAsync(def.id, {
          name: def.name,
          description: def.description,
          importance: def.importance,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
          enableVibrate: true,
          showBadge: true,
        })
      )
    );
    channelsCreated = true;
  } catch (err) {
    console.warn('[notifications] failed to create android channels:', err);
  }
};

// Pull a push data payload out of an Expo notification (works for both the
// foreground listener and the tap-response listener).
export const extractPushData = (
  notification: Notifications.Notification | Notifications.NotificationResponse
): MobilePushData => {
  const asResponse = notification as Notifications.NotificationResponse;
  const data =
    asResponse.notification?.request?.content?.data ??
    (notification as Notifications.Notification).request?.content?.data ??
    {};
  return (data ?? {}) as MobilePushData;
};

export const getRouteForResponse = (
  response: Notifications.NotificationResponse
): ReturnType<typeof routeForNotification> => {
  const data = extractPushData(response);
  return routeForNotification(data);
};
