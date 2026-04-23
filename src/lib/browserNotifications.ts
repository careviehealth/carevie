"use client";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const BROWSER_NOTIFICATION_HISTORY_TTL_MS = 7 * ONE_DAY_MS;
export const BROWSER_NOTIFICATION_PREFERENCE_EVENT =
  "vytara:browser-notifications-preference-updated";

type BrowserNotificationHistory = Record<string, number>;

type BrowserNotificationPreferenceDetail = {
  userId: string;
  enabled: boolean;
};

export const browserNotificationPreferenceKey = (userId: string) =>
  `vytara:browser-notifications:enabled:${userId}`;

export const browserNotificationHistoryKey = (userId: string) =>
  `vytara:browser-notifications:fired:${userId}`;

const isHistoryRecord = (value: unknown): value is BrowserNotificationHistory => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "number" && Number.isFinite(entry));
};

export const isBrowserNotificationSupported = () =>
  typeof window !== "undefined" && "Notification" in window;

export const getBrowserNotificationPermission = () => {
  if (!isBrowserNotificationSupported()) return "unsupported" as const;
  return window.Notification.permission;
};

export const readBrowserNotificationPreference = (userId: string) => {
  if (!userId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(browserNotificationPreferenceKey(userId)) === "true";
  } catch {
    return false;
  }
};

export const setBrowserNotificationPreference = (userId: string, enabled: boolean) => {
  if (!userId || typeof window === "undefined") return;
  try {
    const storageKey = browserNotificationPreferenceKey(userId);
    if (enabled) {
      window.localStorage.setItem(storageKey, "true");
    } else {
      window.localStorage.removeItem(storageKey);
    }
    window.dispatchEvent(
      new CustomEvent<BrowserNotificationPreferenceDetail>(BROWSER_NOTIFICATION_PREFERENCE_EVENT, {
        detail: { userId, enabled },
      })
    );
  } catch {
    // Non-blocking local preference persistence.
  }
};

const pruneBrowserNotificationHistory = (
  history: BrowserNotificationHistory,
  now = Date.now()
): BrowserNotificationHistory => {
  return Object.fromEntries(
    Object.entries(history).filter(([, sentAt]) => now - sentAt <= BROWSER_NOTIFICATION_HISTORY_TTL_MS)
  );
};

export const readBrowserNotificationHistory = (userId: string) => {
  if (!userId || typeof window === "undefined") return {} as BrowserNotificationHistory;
  try {
    const raw = window.localStorage.getItem(browserNotificationHistoryKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isHistoryRecord(parsed)) return {};
    return pruneBrowserNotificationHistory(parsed);
  } catch {
    return {};
  }
};

export const writeBrowserNotificationHistory = (
  userId: string,
  history: BrowserNotificationHistory
) => {
  if (!userId || typeof window === "undefined") return;
  try {
    const nextHistory = pruneBrowserNotificationHistory(history);
    if (Object.keys(nextHistory).length > 0) {
      window.localStorage.setItem(
        browserNotificationHistoryKey(userId),
        JSON.stringify(nextHistory)
      );
    } else {
      window.localStorage.removeItem(browserNotificationHistoryKey(userId));
    }
  } catch {
    // Non-blocking history persistence.
  }
};
