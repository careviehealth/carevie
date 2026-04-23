"use client";

// Toggle button for canonical Web Push delivery. Backed by the platform
// service worker registered via PushSubscriptionManager — flipping this on
// calls subscribePushNotifications() (asks for OS-level permission, opens a
// PushSubscription, and POSTs it to /api/notifications/push/subscribe).
// Flipping it off calls unsubscribePushNotifications().

import { useEffect, useState } from "react";

import {
  getNotificationPermission,
  isPushSupported,
  subscribePushNotifications,
  unsubscribePushNotifications,
} from "@/components/PushSubscriptionManager";

type BrowserNotificationsToggleProps = {
  userId: string;
  className?: string;
};

const SW_URL = "/notifications-sw.js";

const detectActiveSubscription = async (): Promise<boolean> => {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
};

export function BrowserNotificationsToggle({
  userId,
  className = "",
}: BrowserNotificationsToggleProps) {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    getNotificationPermission()
  );
  const [enabled, setEnabled] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setEnabled(false);
      return;
    }
    setPermission(getNotificationPermission());
    void detectActiveSubscription().then(setEnabled);
  }, [userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    const sync = () => {
      setPermission(getNotificationPermission());
      void detectActiveSubscription().then(setEnabled);
    };

    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [userId]);

  if (!userId || !isPushSupported()) return null;

  const handleToggle = async () => {
    if (permission === "denied") return;
    setError(null);
    setIsUpdating(true);
    try {
      if (enabled) {
        const result = await unsubscribePushNotifications();
        if (result.ok) {
          setEnabled(false);
        } else {
          setError("Could not turn off browser alerts.");
        }
        return;
      }
      const result = await subscribePushNotifications();
      setPermission(getNotificationPermission());
      if (result.ok) {
        setEnabled(true);
      } else if (result.reason === "denied") {
        setError("Permission denied. Re-enable in your browser settings.");
      } else if (result.reason === "unsupported") {
        setError("Browser doesn't support push notifications.");
      } else {
        setError(result.message ?? "Could not enable browser alerts.");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const isDenied = permission === "denied";
  const buttonLabel = isUpdating
    ? enabled
      ? "Turning off..."
      : "Enabling..."
    : enabled
      ? "Browser alerts on"
      : "Enable browser alerts";

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => {
          void handleToggle();
        }}
        disabled={isDenied || isUpdating}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
          enabled
            ? "border-teal-200 bg-teal-50 text-teal-700 hover:border-teal-300 hover:bg-teal-100"
            : isDenied
              ? "cursor-not-allowed border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-800"
        }`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            enabled ? "bg-teal-500" : isDenied ? "bg-amber-500" : "bg-slate-300"
          }`}
        />
        <span>{buttonLabel}</span>
      </button>
      {isDenied ? (
        <p className="mt-2 text-[11px] text-amber-700">
          Browser notifications are blocked. Re-enable them in your browser settings to use desktop reminders.
        </p>
      ) : error ? (
        <p className="mt-2 text-[11px] text-amber-700">{error}</p>
      ) : null}
    </div>
  );
}
