// Mounts inside AuthProvider. Responsibilities:
//
//   * Install the Expo foreground notification handler + Android channels
//     (once per process).
//   * Re-register the device's Expo Push token with the backend on every cold
//     start (tokens can rotate; calling subscribe is idempotent).
//   * Subscribe to Expo's `addPushTokenListener` so a mid-session rotation also
//     re-registers without waiting for the next cold start.
//   * Listen for tap responses and route the user to the relevant screen. This
//     handles both warm taps (app already running) and cold taps (tap on a
//     notification from the system tray launches the app fresh).
//
// We intentionally do NOT prompt for permission here. iOS only allows one
// system prompt — burning it at app launch tanks opt-in rates. A dedicated
// settings screen / first-action prompt should call `registerExpoPushToken({
// promptIfNeeded: true })`.

import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef, type ReactNode } from 'react';

import { useAuthContext } from '@/providers/AuthProvider';
import { registerExpoPushToken } from '@/lib/expoPushRegistration';
import {
  ensureAndroidChannels,
  getRouteForResponse,
  installForegroundHandler,
} from '@/lib/notificationHandlers';

installForegroundHandler();

export function PushNotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuthContext();
  const router = useRouter();
  const lastRegisteredUserIdRef = useRef<string | null>(null);
  const handledColdStartRef = useRef(false);

  useEffect(() => {
    void ensureAndroidChannels();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user?.id) {
      lastRegisteredUserIdRef.current = null;
      return;
    }
    if (lastRegisteredUserIdRef.current === user.id) return;
    lastRegisteredUserIdRef.current = user.id;

    void registerExpoPushToken({ promptIfNeeded: false }).then((outcome) => {
      if (outcome.status !== 'registered' && outcome.status !== 'permission-undetermined') {
        console.log('[notifications] expo push registration:', outcome);
      }
    });
  }, [user?.id, isLoading]);

  useEffect(() => {
    const sub = Notifications.addPushTokenListener(() => {
      void registerExpoPushToken({ promptIfNeeded: false });
    });
    return () => sub.remove();
  }, []);

  // Tap handler — warm taps.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = getRouteForResponse(response);
      try {
        router.push({ pathname: route.pathname as never, params: route.params });
      } catch (err) {
        console.warn('[notifications] failed to route tap:', err);
      }
    });
    return () => sub.remove();
  }, [router]);

  // Cold-start tap — user tapped a notification that launched the app fresh.
  // Expo surfaces the response via getLastNotificationResponseAsync(). Wait for
  // auth + profile bootstrapping before routing (otherwise AuthGate will bounce
  // us straight back).
  useEffect(() => {
    if (handledColdStartRef.current) return;
    if (isLoading) return;
    if (!user?.id) return;
    handledColdStartRef.current = true;

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const route = getRouteForResponse(response);
      try {
        router.push({ pathname: route.pathname as never, params: route.params });
      } catch (err) {
        console.warn('[notifications] failed to route cold-start tap:', err);
      }
    });
  }, [isLoading, user?.id, router]);

  return <>{children}</>;
}
