"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  formatMedicationDosage,
  getDueMedicationReminderSlots,
  type MedicationMealTiming,
} from "@/lib/medications";
import {
  BROWSER_NOTIFICATION_PREFERENCE_EVENT,
  getBrowserNotificationPermission,
  isBrowserNotificationSupported,
  readBrowserNotificationHistory,
  readBrowserNotificationPreference,
  writeBrowserNotificationHistory,
} from "@/lib/browserNotifications";

type Appointment = {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
};

type MedicationLog = {
  medicationId?: string;
  timestamp?: string;
  taken?: boolean;
  slotKey?: string;
};

type MedicationReminderSource = {
  id: string;
  name: string;
  dosage?: string;
  frequency?: string;
  mealTiming?: MedicationMealTiming;
  startDate?: string;
  endDate?: string;
  logs?: MedicationLog[];
};

type BrowserNotificationManagerProps = {
  userId: string;
  profileId?: string;
  appointments: Appointment[];
  medications?: MedicationReminderSource[];
};

type BrowserReminderNotification = {
  id: string;
  title: string;
  body: string;
  href: string;
  tag: string;
};

type AppointmentReminderStage = {
  key: "30m" | "2h" | "24h";
  thresholdMs: number;
  label: string;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NOTIFICATION_POLL_MS = 60_000;
const MEAL_REMINDER_WINDOW_MS = 90 * 60 * 1000;
const APPOINTMENT_REMINDER_STAGES: AppointmentReminderStage[] = [
  { key: "30m", thresholdMs: 30 * 60 * 1000, label: "in 30 minutes" },
  { key: "2h", thresholdMs: 2 * 60 * 60 * 1000, label: "in 2 hours" },
  { key: "24h", thresholdMs: ONE_DAY_MS, label: "within 24 hours" },
];

const parseAppointmentDateTime = (appointment: Appointment) => {
  const parsed = new Date(`${appointment.date}T${appointment.time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getAppointmentReminderStage = (diffMs: number) => {
  if (diffMs <= 0 || diffMs > ONE_DAY_MS) return null;
  return APPOINTMENT_REMINDER_STAGES.find((stage) => diffMs <= stage.thresholdMs) ?? null;
};

const formatAppointmentReminderTime = (date: Date) =>
  date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const supportsForegroundBrowserAlerts = () => {
  if (!isBrowserNotificationSupported() || typeof document === "undefined") return false;
  return document.visibilityState !== "visible" || !document.hasFocus();
};

export function BrowserNotificationManager({
  userId,
  profileId,
  appointments,
  medications = [],
}: BrowserNotificationManagerProps) {
  const [nowEpoch, setNowEpoch] = useState(() => Date.now());
  const [permission, setPermission] = useState(() => getBrowserNotificationPermission());
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(() =>
    readBrowserNotificationPreference(userId)
  );
  const notificationHistoryRef = useRef<Record<string, number>>(readBrowserNotificationHistory(userId));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timeout = window.setTimeout(() => {
      setNowEpoch(Date.now());
    }, 0);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [appointments, medications, profileId, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;

    const handleVisibilityOrFocusChange = () => {
      setPermission(getBrowserNotificationPermission());
    };

    const handlePreferenceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; enabled: boolean }>).detail;
      if (!detail || detail.userId !== userId) return;
      setBrowserNotificationsEnabled(detail.enabled);
    };

    window.addEventListener("focus", handleVisibilityOrFocusChange);
    document.addEventListener("visibilitychange", handleVisibilityOrFocusChange);
    window.addEventListener(
      BROWSER_NOTIFICATION_PREFERENCE_EVENT,
      handlePreferenceChange as EventListener
    );

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocusChange);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocusChange);
      window.removeEventListener(
        BROWSER_NOTIFICATION_PREFERENCE_EVENT,
        handlePreferenceChange as EventListener
      );
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    const interval = window.setInterval(() => {
      setNowEpoch(Date.now());
    }, NOTIFICATION_POLL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [userId]);

  const reminderNotifications = useMemo<BrowserReminderNotification[]>(() => {
    if (!profileId) return [];

    const now = new Date(nowEpoch);
    const medicationAlerts = medications
      .flatMap<BrowserReminderNotification>((medication) => {
        const medicationId =
          typeof medication.id === "string" && medication.id.trim() ? medication.id.trim() : "";
        const medicationName =
          typeof medication.name === "string" ? medication.name.trim() : "";
        if (!medicationId || !medicationName) return [];

        return getDueMedicationReminderSlots(medication, now, MEAL_REMINDER_WINDOW_MS).map((slot) => {
          const dateKey = `${slot.slotTime.getFullYear()}-${String(
            slot.slotTime.getMonth() + 1
          ).padStart(2, "0")}-${String(slot.slotTime.getDate()).padStart(2, "0")}`;
          const reminderId = `browser:medication:${profileId}:${medicationId}:${dateKey}:${slot.key}`;
          const dosage =
            typeof medication.dosage === "string" && medication.dosage.trim()
              ? formatMedicationDosage(medication.dosage)
              : "";
          return {
            id: reminderId,
            title: "Medication due now",
            body: `${medicationName}${dosage ? ` · ${dosage}` : ""} · ${slot.context}`,
            href: "/app/homepage?open=medications",
            tag: `vytara-medication-${medicationId}-${slot.key}`,
          };
        });
      })
      .sort((a, b) => a.id.localeCompare(b.id));

    const appointmentAlerts = appointments
      .map((appointment) => {
        const dateTime = parseAppointmentDateTime(appointment);
        if (!dateTime) return null;
        const diffMs = dateTime.getTime() - nowEpoch;
        const stage = getAppointmentReminderStage(diffMs);
        if (!stage) return null;
        const appointmentTitle = appointment.title?.trim() || appointment.type?.trim() || "Appointment";
        return {
          id: `browser:appointment:${profileId}:${appointment.id}:${stage.key}`,
          title: "Upcoming appointment",
          body: `${appointmentTitle} ${stage.label} · ${formatAppointmentReminderTime(dateTime)}`,
          href: "/app/homepage?open=calendar",
          tag: `vytara-appointment-${appointment.id}-${stage.key}`,
        } satisfies BrowserReminderNotification;
      })
      .filter((entry): entry is BrowserReminderNotification => entry !== null)
      .sort((a, b) => a.id.localeCompare(b.id));

    return [...appointmentAlerts, ...medicationAlerts];
  }, [appointments, medications, nowEpoch, profileId]);

  useEffect(() => {
    if (!userId) return;
    if (permission !== "granted" || !browserNotificationsEnabled) return;
    if (!supportsForegroundBrowserAlerts()) return;

    const unseenNotifications = reminderNotifications.filter(
      (notification) => !notificationHistoryRef.current[notification.id]
    );
    if (unseenNotifications.length === 0) return;

    const firedAt = Date.now();
    const nextHistory = { ...notificationHistoryRef.current };
    unseenNotifications.forEach((notification) => {
      nextHistory[notification.id] = firedAt;
    });
    notificationHistoryRef.current = nextHistory;
    writeBrowserNotificationHistory(userId, nextHistory);

    unseenNotifications.forEach((notification) => {
      try {
        const browserNotification = new window.Notification(notification.title, {
          body: notification.body,
          tag: notification.tag,
          icon: "/vytara-logo.png",
          badge: "/vytara-logo.png",
        });
        browserNotification.onclick = (event) => {
          event.preventDefault();
          window.focus();
          window.location.assign(notification.href);
          browserNotification.close();
        };
      } catch {
        // Ignore browser notification delivery failures.
      }
    });
  }, [
    browserNotificationsEnabled,
    permission,
    reminderNotifications,
    userId,
  ]);

  return null;
}
