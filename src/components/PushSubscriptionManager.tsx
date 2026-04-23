"use client";

// Owns the lifecycle of this browser's Web Push subscription:
//   1. Registers /notifications-sw.js
//   2. Reads the VAPID public key from the backend
//   3. Subscribes via PushManager.subscribe (or surfaces the existing one)
//   4. POSTs the subscription to /api/notifications/push/subscribe
//
// Headless component: returns null. State is exposed through a context-free
// imperative API (subscribePushNotifications / unsubscribePushNotifications)
// so other UI (the toggle, settings, the bell panel) can drive it.
//
// We intentionally do NOT auto-prompt for permission. The toggle button calls
// subscribePushNotifications() in response to a user gesture.

import { useEffect } from "react";

const SW_URL = "/notifications-sw.js";

const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

export const isPushSupported = (): boolean => {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
};

export const getNotificationPermission = (): NotificationPermission => {
  if (typeof window === "undefined" || !("Notification" in window)) return "default";
  return Notification.permission;
};

const registerServiceWorker = async (): Promise<ServiceWorkerRegistration> => {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: "/" });
};

const fetchVapidPublicKey = async (): Promise<string> => {
  const res = await fetch("/api/notifications/push/vapid-public-key", {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Failed to load VAPID key (${res.status})`);
  }
  const json = (await res.json()) as { publicKey?: string };
  if (!json.publicKey) throw new Error("VAPID key missing in response");
  return json.publicKey;
};

const sendSubscriptionToBackend = async (subscription: PushSubscription) => {
  const res = await fetch("/api/notifications/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      platform:
        typeof navigator !== "undefined"
          ? (navigator as Navigator & { platform?: string }).platform ?? null
          : null,
    }),
  });
  if (!res.ok) {
    const message = await res.text().catch(() => "");
    throw new Error(`subscribe failed (${res.status}): ${message}`);
  }
};

const sendUnsubscribeToBackend = async (endpoint: string) => {
  await fetch("/api/notifications/push/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ endpoint }),
  }).catch(() => {});
};

export type SubscribeOutcome =
  | { ok: true; endpoint: string }
  | { ok: false; reason: "unsupported" | "denied" | "error"; message?: string };

export const subscribePushNotifications = async (): Promise<SubscribeOutcome> => {
  if (!isPushSupported()) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      return { ok: false, reason: "denied" };
    }

    const registration = await registerServiceWorker();
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const publicKey = await fetchVapidPublicKey();
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    await sendSubscriptionToBackend(subscription);
    return { ok: true, endpoint: subscription.endpoint };
  } catch (err) {
    console.error("[push] subscribe failed", err);
    return {
      ok: false,
      reason: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
};

export const unsubscribePushNotifications = async (): Promise<{ ok: boolean }> => {
  if (!isPushSupported()) return { ok: false };
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    if (!registration) return { ok: true };
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { ok: true };
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await sendUnsubscribeToBackend(endpoint);
    return { ok: true };
  } catch (err) {
    console.error("[push] unsubscribe failed", err);
    return { ok: false };
  }
};

// Best-effort sync: if the user already granted permission and has a live
// subscription, make sure the backend knows about it (e.g. after relogging in
// on a different account, or after a deploy reset their endpoint row).
export const reconcilePushSubscription = async (): Promise<void> => {
  if (!isPushSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await sendSubscriptionToBackend(subscription).catch((err) => {
        console.warn("[push] reconcile failed", err);
      });
    }
  } catch (err) {
    console.warn("[push] reconcile threw", err);
  }
};

type Props = { userId?: string | null };

export default function PushSubscriptionManager({ userId }: Props) {
  useEffect(() => {
    if (!userId) return;
    if (!isPushSupported()) return;

    // Register the SW eagerly so subsequent push events have a worker to wake.
    registerServiceWorker().catch((err) => {
      console.warn("[push] sw registration failed", err);
    });

    // If already authorized, sync the existing subscription with the backend.
    void reconcilePushSubscription();
  }, [userId]);

  return null;
}
