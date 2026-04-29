// Expo Push token registration.
//
// On every cold start (and on token rotation events), this module:
//   1. Verifies we're on a real device (Expo Push doesn't work on simulators).
//   2. Reads/requests OS notification permission. We do NOT auto-prompt — the
//      caller decides when to ask. We only register if permission is already
//      `granted` so we never burn iOS's one-shot prompt at app launch.
//   3. Reads (or generates + persists) a stable per-install deviceId.
//   4. Asks Expo for the current push token (uses the EAS projectId from app.json).
//   5. POSTs the token to the Vytara backend so the queue can target this device.
//
// All errors are caught and surfaced via the returned status; nothing here
// should ever throw into the React tree.

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { subscribeExpoPushToken, unsubscribeExpoPushToken } from '@/api/modules/notifications';

const DEVICE_ID_KEY = 'vytara.notifications.deviceId';

export type RegistrationOutcome =
  | { status: 'registered'; expoPushToken: string; deviceId: string }
  | { status: 'permission-denied' }
  | { status: 'permission-undetermined' }
  | { status: 'unsupported-device' }
  | { status: 'missing-project-id' }
  | { status: 'error'; message: string };

const getEasProjectId = (): string | null => {
  const fromExpoConfig = Constants.expoConfig?.extra?.eas?.projectId;
  const fromManifest = (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig
    ?.projectId;
  return (
    (typeof fromExpoConfig === 'string' && fromExpoConfig) ||
    (typeof fromManifest === 'string' && fromManifest) ||
    null
  );
};

const getOrCreateDeviceId = async (): Promise<string> => {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing && existing.length >= 16) return existing;
  // Use Web Crypto if available (Hermes 0.74+), else fall back to a manual id.
  const cryptoRef = (globalThis as { crypto?: Crypto }).crypto;
  const fresh =
    typeof cryptoRef?.randomUUID === 'function'
      ? cryptoRef.randomUUID()
      : `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, fresh);
  return fresh;
};

export const ensureNotificationPermission = async (): Promise<
  'granted' | 'denied' | 'undetermined'
> => {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return 'granted';
  if (current.status === 'denied' && current.canAskAgain === false) return 'denied';
  const next = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  if (next.status === 'granted') return 'granted';
  return next.status === 'denied' ? 'denied' : 'undetermined';
};

export const registerExpoPushToken = async (options: {
  promptIfNeeded?: boolean;
} = {}): Promise<RegistrationOutcome> => {
  if (!Device.isDevice) return { status: 'unsupported-device' };
  if (Platform.OS === 'web') return { status: 'unsupported-device' };

  const projectId = getEasProjectId();
  if (!projectId) return { status: 'missing-project-id' };

  try {
    const current = await Notifications.getPermissionsAsync();
    let permission: 'granted' | 'denied' | 'undetermined' =
      current.status === 'granted'
        ? 'granted'
        : current.status === 'denied'
          ? 'denied'
          : 'undetermined';
    if (permission !== 'granted') {
      if (!options.promptIfNeeded) {
        return permission === 'denied' && current.canAskAgain === false
          ? { status: 'permission-denied' }
          : { status: 'permission-undetermined' };
      }
      permission = await ensureNotificationPermission();
    }
    if (permission !== 'granted') {
      return permission === 'denied'
        ? { status: 'permission-denied' }
        : { status: 'permission-undetermined' };
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse.data;
    const deviceId = await getOrCreateDeviceId();
    const appVersion = Constants.expoConfig?.version ?? null;

    await subscribeExpoPushToken({
      expoPushToken,
      deviceId,
      platform: Platform.OS,
      appVersion,
    });

    return { status: 'registered', expoPushToken, deviceId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to register push token';
    return { status: 'error', message };
  }
};

export const unregisterExpoPushToken = async (expoPushToken: string): Promise<void> => {
  try {
    await unsubscribeExpoPushToken(expoPushToken);
  } catch (err) {
    // Best-effort. The server keeps stale tokens disabled via receipt cleanup.
    console.warn('[notifications] unregister failed:', err);
  }
};
