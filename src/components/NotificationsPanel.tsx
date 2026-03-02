"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Calendar, FileText, Pill, X } from "lucide-react";
import { supabase } from "@/lib/createClient";

type CareCircleInvite = {
  id: string;
  name: string;
  createdAt: string;
};

type Appointment = {
  id: string;
  date: string;
  time: string;
  title: string;
  type: string;
};

type FamilyJoinRequestNotification = {
  id: string;
  requestId: string;
  requesterId: string;
  requesterName: string;
  createdAt: string;
};

type FamilyAcceptanceNotification = {
  id: string;
  familyId: string;
  familyName: string;
  createdAt?: string;
};

type FamilyAppointmentNotification = {
  id: string;
  memberId: string;
  memberName: string;
  appointment: Appointment;
  dateTime: Date;
};

type FamilyVaultFile = {
  name: string;
  created_at: string | null;
  folder: "reports" | "prescriptions" | "insurance" | "bills";
};

type FamilyVaultNotification = {
  id: string;
  memberId: string;
  memberName: string;
  fileName: string;
  createdAt: string;
  folder: FamilyVaultFile["folder"];
};

type FamilyMedicationNotification = {
  id: string;
  memberId: string;
  memberName: string;
  medicationName: string;
  startDate: string;
};

type FamilyMemberDetailsResponse = {
  personal?: { display_name?: string | null } | null;
  appointments?: Appointment[];
  medications?: Array<{
    id?: string;
    name?: string;
    startDate?: string;
  }>;
};

type CareCircleLinkRow = {
  id: string;
  status: string;
  role: string;
  displayName: string;
  createdAt: string;
  updatedAt: string | null;
};

type NotificationsPanelProps = {
  userId: string;
  profileId?: string;
  appointments: Appointment[];
  variant?: "desktop" | "modal";
};

type AppointmentsRow = {
  profile_id: string;
  appointments: unknown;
};

type ProfileLabelRow = {
  id: string;
  display_name: string | null;
  name: string | null;
};

type ActivityLogDomain = "vault" | "medication" | "appointment";
type ActivityLogAction = "upload" | "rename" | "delete" | "add" | "update";

type ActivityLogRow = {
  id: string;
  profile_id: string;
  source: string;
  domain: ActivityLogDomain;
  action: ActivityLogAction;
  actor_user_id: string;
  actor_display_name: string | null;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type SharedActivityLogRow = ActivityLogRow & {
  profile_label?: string | null;
  link_id?: string | null;
};

type ActivityMetadataChangeValue = string | number | boolean | null;

type ActivityMetadataChange = {
  field: string;
  label: string;
  before: ActivityMetadataChangeValue;
  after: ActivityMetadataChangeValue;
};

type ActivityLogText = {
  title: string;
  subtitle: string;
  details?: string;
  changeItems?: Array<{
    label: string;
    before: string;
    after: string;
  }>;
};

type AccountAppointmentNotification = {
  notificationId: string;
  profileId: string;
  profileLabel: string | null;
  appointment: Appointment;
  dateTime: Date;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ACCEPTED_NOTIFICATION_TTL_MS = ONE_DAY_MS;
const LOGS_PAGE_SIZE = 20;
const dismissedInvitesKey = (userId: string) =>
  `vytara:dismissed-invites:${userId}:account`;
const dismissedAppointmentsKey = (userId: string) =>
  `vytara:dismissed-appointments:${userId}:account`;
const dismissedFamilyNotificationsKey = (userId: string) =>
  `vytara:dismissed-family-notifications:${userId}`;
const seenNotificationsKey = (userId: string) =>
  `vytara:seen-notification-panel-items:${userId}:account`;
const seenLogsKey = (userId: string, profileId?: string) =>
  `vytara:seen-logs:${userId}:${profileId ?? "account"}`;
const selfAppointmentNotificationId = (ownerProfileId: string, appointmentId: string) =>
  `appointment:self:${ownerProfileId}:${appointmentId}`;
const inviteNotificationId = (inviteId: string) => `invite:${inviteId}`;
const familyActivityNotificationId = (activityId: string) => `family-activity:${activityId}`;
const careCircleTabByDomain: Record<ActivityLogDomain, "vault" | "medications" | "appointments"> = {
  vault: "vault",
  medication: "medications",
  appointment: "appointments",
};
const vaultFolderLabels: Record<FamilyVaultFile["folder"], string> = {
  reports: "Lab report",
  prescriptions: "Prescription",
  insurance: "Insurance",
  bills: "Bill",
};

const parseAppointmentDateTime = (appointment: Appointment) => {
  const parsed = new Date(`${appointment.date}T${appointment.time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const parseStoredStringArray = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
};

const parseJsonArray = (value: unknown, fallbackKey: string): unknown[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>)[fallbackKey])) {
    return (value as Record<string, unknown>)[fallbackKey] as unknown[];
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed;
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as Record<string, unknown>)[fallbackKey])
      ) {
        return (parsed as Record<string, unknown>)[fallbackKey] as unknown[];
      }
    } catch {
      return [];
    }
  }
  return [];
};

const parseStoredLogSeenValue = (value: string | null): string[] => {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.includes("T") && Number.isFinite(Date.parse(trimmed))) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === "string");
    }
    if (typeof parsed === "string") {
      const parsedTrimmed = parsed.trim();
      return parsedTrimmed ? [parsedTrimmed] : [];
    }
    return [];
  } catch {
    return [trimmed];
  }
};

export function NotificationsPanel({
  userId,
  profileId,
  appointments,
  variant = "desktop",
}: NotificationsPanelProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"notifications" | "logs">("notifications");
  const [careCircleInvites, setCareCircleInvites] = useState<CareCircleInvite[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState("");
  const [familyNotificationsLoading, setFamilyNotificationsLoading] = useState(false);
  const [familyNotificationsError, setFamilyNotificationsError] = useState("");
  const [nowEpoch, setNowEpoch] = useState(0);
  const [dismissedInviteIds, setDismissedInviteIds] = useState<Set<string>>(() => new Set());
  const [dismissedAppointmentIds, setDismissedAppointmentIds] = useState<Set<string>>(() => new Set());
  const [dismissedFamilyNotificationIds, setDismissedFamilyNotificationIds] = useState<Set<string>>(
    () => new Set()
  );
  const [seenNotificationIds, setSeenNotificationIds] = useState<Set<string>>(() => new Set());
  const [familyJoinRequests, setFamilyJoinRequests] = useState<FamilyJoinRequestNotification[]>(
    []
  );
  const [familyAcceptance, setFamilyAcceptance] = useState<FamilyAcceptanceNotification | null>(
    null
  );
  const [familyAppointments, setFamilyAppointments] = useState<FamilyAppointmentNotification[]>(
    []
  );
  const [familyVaultUpdates, setFamilyVaultUpdates] = useState<FamilyVaultNotification[]>([]);
  const [familyMedicationStarts, setFamilyMedicationStarts] = useState<
    FamilyMedicationNotification[]
  >([]);
  const [allProfileAppointments, setAllProfileAppointments] = useState<AccountAppointmentNotification[]>(
    []
  );
  const [sharedFamilyActivityLogs, setSharedFamilyActivityLogs] = useState<SharedActivityLogRow[]>(
    []
  );
  const [activityLogs, setActivityLogs] = useState<ActivityLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoadingMore, setLogsLoadingMore] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [logsOffset, setLogsOffset] = useState(0);
  const [logsHasMore, setLogsHasMore] = useState(false);
  const [seenLogIds, setSeenLogIds] = useState<Set<string>>(() => new Set());
  const [serverDismissedNotificationIds, setServerDismissedNotificationIds] = useState<Set<string>>(
    () => new Set()
  );
  const [hasHydratedServerDismissedNotifications, setHasHydratedServerDismissedNotifications] =
    useState(false);
  const syncedDismissedStateNotificationIdsKeyRef = useRef("");
  const [hasHydratedDismissedNotifications, setHasHydratedDismissedNotifications] = useState(false);
  const [hydratedDismissedInvitesKey, setHydratedDismissedInvitesKey] = useState<string | null>(null);
  const [hydratedDismissedAppointmentsKey, setHydratedDismissedAppointmentsKey] = useState<string | null>(
    null
  );
  const [hydratedDismissedFamilyKey, setHydratedDismissedFamilyKey] = useState<string | null>(null);
  const [hasHydratedSeenNotifications, setHasHydratedSeenNotifications] = useState(false);
  const [hasHydratedSeenLogs, setHasHydratedSeenLogs] = useState(false);
  const [hydratedSeenLogsKey, setHydratedSeenLogsKey] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    setHasHydratedDismissedNotifications(false);
    setHydratedDismissedInvitesKey(null);
    setHydratedDismissedAppointmentsKey(null);
    setHydratedDismissedFamilyKey(null);
    setHasHydratedSeenNotifications(false);
    try {
      const primaryDismissedInvitesKey = dismissedInvitesKey(userId);
      const primaryDismissedAppointmentsKey = dismissedAppointmentsKey(userId);
      const primaryDismissedFamilyKey = dismissedFamilyNotificationsKey(userId);
      const storedInvites = window.localStorage.getItem(primaryDismissedInvitesKey);
      const storedAppointments = window.localStorage.getItem(primaryDismissedAppointmentsKey);
      const storedFamilyNotifications = window.localStorage.getItem(primaryDismissedFamilyKey);
      const primarySeenNotificationsKey = seenNotificationsKey(userId);
      const storedSeenNotificationsPrimary = window.localStorage.getItem(
        primarySeenNotificationsKey
      );
      const resolvedSeenNotificationsRaw = storedSeenNotificationsPrimary;
      setDismissedInviteIds(new Set(parseStoredStringArray(storedInvites)));
      setDismissedAppointmentIds(new Set(parseStoredStringArray(storedAppointments)));
      setDismissedFamilyNotificationIds(new Set(parseStoredStringArray(storedFamilyNotifications)));
      const parsedSeenNotifications = parseStoredStringArray(
        resolvedSeenNotificationsRaw
      );
      setSeenNotificationIds(new Set(parsedSeenNotifications));
      setHydratedDismissedInvitesKey(primaryDismissedInvitesKey);
      setHydratedDismissedAppointmentsKey(primaryDismissedAppointmentsKey);
      setHydratedDismissedFamilyKey(primaryDismissedFamilyKey);
      if (!storedSeenNotificationsPrimary && parsedSeenNotifications.length > 0) {
        window.localStorage.setItem(primarySeenNotificationsKey, JSON.stringify(parsedSeenNotifications));
      }
    } catch {
      setDismissedInviteIds(new Set());
      setDismissedAppointmentIds(new Set());
      setDismissedFamilyNotificationIds(new Set());
      setSeenNotificationIds(new Set());
    }
    setHasHydratedDismissedNotifications(true);
    setHasHydratedSeenNotifications(true);
  }, [profileId, userId]);

  useEffect(() => {
    if (!hasHydratedDismissedNotifications || !userId || typeof window === "undefined") return;
    const storageKey = dismissedInvitesKey(userId);
    if (hydratedDismissedInvitesKey !== storageKey) return;
    const merged = new Set(parseStoredStringArray(window.localStorage.getItem(storageKey)));
    dismissedInviteIds.forEach((id) => merged.add(id));
    if (merged.size > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(merged)));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, [
    dismissedInviteIds,
    hasHydratedDismissedNotifications,
    hydratedDismissedInvitesKey,
    userId,
  ]);

  useEffect(() => {
    if (!hasHydratedDismissedNotifications || !userId || typeof window === "undefined") return;
    const storageKey = dismissedAppointmentsKey(userId);
    if (hydratedDismissedAppointmentsKey !== storageKey) return;
    const merged = new Set(parseStoredStringArray(window.localStorage.getItem(storageKey)));
    dismissedAppointmentIds.forEach((id) => merged.add(id));
    if (merged.size > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(merged)));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, [
    dismissedAppointmentIds,
    hasHydratedDismissedNotifications,
    hydratedDismissedAppointmentsKey,
    userId,
  ]);

  useEffect(() => {
    if (!hasHydratedDismissedNotifications || !userId || typeof window === "undefined") return;
    const storageKey = dismissedFamilyNotificationsKey(userId);
    if (hydratedDismissedFamilyKey !== storageKey) return;
    const merged = new Set(parseStoredStringArray(window.localStorage.getItem(storageKey)));
    dismissedFamilyNotificationIds.forEach((id) => merged.add(id));
    if (merged.size > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(merged)));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, [
    dismissedFamilyNotificationIds,
    hasHydratedDismissedNotifications,
    hydratedDismissedFamilyKey,
    userId,
  ]);

  useEffect(() => {
    if (!hasHydratedSeenNotifications || !userId || typeof window === "undefined") return;
    window.localStorage.setItem(
      seenNotificationsKey(userId),
      JSON.stringify(Array.from(seenNotificationIds))
    );
  }, [hasHydratedSeenNotifications, seenNotificationIds, userId]);

  useEffect(() => {
    if (!userId || typeof window === "undefined") return;
    setHasHydratedSeenLogs(false);
    setHydratedSeenLogsKey(null);
    const storageKey = seenLogsKey(userId, profileId);
    const fallbackKey = seenLogsKey(userId);
    const primaryStored = window.localStorage.getItem(storageKey);
    const fallbackStored =
      profileId && !primaryStored ? window.localStorage.getItem(fallbackKey) : null;
    const stored = primaryStored ?? fallbackStored;
    const parsedSeenLogs = parseStoredLogSeenValue(stored);
    setSeenLogIds(new Set(parsedSeenLogs));
    if (profileId && !primaryStored && parsedSeenLogs.length > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(parsedSeenLogs));
    }
    setHydratedSeenLogsKey(storageKey);
    setHasHydratedSeenLogs(true);
  }, [profileId, userId]);

  useEffect(() => {
    if (!hasHydratedSeenLogs || !userId || typeof window === "undefined") return;
    const storageKey = seenLogsKey(userId, profileId);
    if (hydratedSeenLogsKey !== storageKey) return;
    const storedSeenLogs = parseStoredLogSeenValue(window.localStorage.getItem(storageKey));
    const mergedSeenLogs = new Set(storedSeenLogs);
    seenLogIds.forEach((id) => mergedSeenLogs.add(id));
    if (mergedSeenLogs.size > 0) {
      window.localStorage.setItem(storageKey, JSON.stringify(Array.from(mergedSeenLogs)));
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, [hasHydratedSeenLogs, hydratedSeenLogsKey, profileId, seenLogIds, userId]);

  useEffect(() => {
    if (!userId) return;
    let isActive = true;

    const fetchInvites = async () => {
      setNotificationsLoading(true);
      setNotificationsError("");
      try {
        const response = await fetch("/api/care-circle/links", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Unable to load invites.");
        }
        const data: {
          incoming?: Array<{
            id: string;
            status: string;
            displayName: string;
            createdAt: string;
          }>;
        } = await response.json();
        const nowTime = Date.now();

        if (!isActive) return;
        const pendingIncoming =
          data.incoming
            ?.filter((invite) => {
              if (invite.status !== "pending") return false;
              const createdTime = Date.parse(invite.createdAt);
              if (!Number.isFinite(createdTime)) return false;
              const ageMs = nowTime - createdTime;
              return ageMs >= 0 && ageMs <= ONE_DAY_MS;
            })
            .map((invite) => ({
              id: invite.id,
              name: invite.displayName,
              createdAt: invite.createdAt,
            })) ?? [];

        setCareCircleInvites(pendingIncoming);
      } catch {
        if (!isActive) return;
        setNotificationsError("Unable to load notifications.");
        setCareCircleInvites([]);
      } finally {
        if (isActive) {
          setNotificationsLoading(false);
        }
      }
    };

    fetchInvites();
    const interval = setInterval(fetchInvites, 60_000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setAllProfileAppointments([]);
      return;
    }

    let isActive = true;

    const loadAllProfileAppointments = async () => {
      try {
        const { data, error } = await supabase
          .from("user_appointments")
          .select("profile_id, appointments")
          .eq("user_id", userId);

        if (error) throw error;

        const rows = ((data ?? []) as AppointmentsRow[]).filter(
          (row): row is AppointmentsRow => Boolean(row?.profile_id)
        );
        const profileIds = Array.from(new Set(rows.map((row) => row.profile_id)));
        const profileLabelById = new Map<string, string | null>();

        if (profileIds.length > 0) {
          const { data: profileRows, error: profileError } = await supabase
            .from("profiles")
            .select("id, display_name, name")
            .in("id", profileIds);

          if (!profileError) {
            (profileRows ?? []).forEach((profile) => {
              const typed = profile as ProfileLabelRow;
              profileLabelById.set(typed.id, typed.display_name?.trim() || typed.name?.trim() || null);
            });
          }
        }

        const byNotificationId = new Map<string, AccountAppointmentNotification>();

        rows.forEach((row) => {
          const appointmentRows = parseJsonArray(row.appointments, "appointments");
          appointmentRows.forEach((entry) => {
            if (!entry || typeof entry !== "object") return;
            const appointment = entry as Record<string, unknown>;
            const appointmentDate =
              typeof appointment.date === "string" ? appointment.date.trim() : "";
            const appointmentTime =
              typeof appointment.time === "string" ? appointment.time.trim() : "";
            if (!appointmentDate || !appointmentTime) return;
            const appointmentId =
              typeof appointment.id === "string" && appointment.id.trim()
                ? appointment.id.trim()
                : `${appointmentDate}-${appointmentTime}-${appointment.title || appointment.type || "appointment"}`;

            const normalizedAppointment: Appointment = {
              id: appointmentId,
              date: appointmentDate,
              time: appointmentTime,
              title: typeof appointment.title === "string" ? appointment.title : "",
              type: typeof appointment.type === "string" ? appointment.type : "Appointment",
            };
            const dateTime = parseAppointmentDateTime(normalizedAppointment);
            if (!dateTime) return;
            const notificationId = selfAppointmentNotificationId(row.profile_id, appointmentId);
            byNotificationId.set(notificationId, {
              notificationId,
              profileId: row.profile_id,
              profileLabel: profileLabelById.get(row.profile_id) ?? null,
              appointment: normalizedAppointment,
              dateTime,
            });
          });
        });

        if (profileId && appointments.length > 0) {
          appointments.forEach((appointment) => {
            const dateTime = parseAppointmentDateTime(appointment);
            if (!dateTime) return;
            const notificationId = selfAppointmentNotificationId(profileId, appointment.id);
            if (byNotificationId.has(notificationId)) return;
            byNotificationId.set(notificationId, {
              notificationId,
              profileId,
              profileLabel: null,
              appointment,
              dateTime,
            });
          });
        }

        if (!isActive) return;
        setAllProfileAppointments(Array.from(byNotificationId.values()));
      } catch {
        if (!isActive) return;
        setAllProfileAppointments([]);
      }
    };

    void loadAllProfileAppointments();
    const interval = setInterval(loadAllProfileAppointments, 120_000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [appointments, profileId, userId]);

  useEffect(() => {
    if (!userId) return;
    let isActive = true;

    const fetchFamilyNotifications = async () => {
      setFamilyNotificationsLoading(true);
      setFamilyNotificationsError("");
      try {
        const nowTime = Date.now();
        const linksResponse = await fetch("/api/care-circle/links", {
          cache: "no-store",
        });
        if (!linksResponse.ok) {
          throw new Error("Unable to load care circle links.");
        }
        const linksPayload = (await linksResponse.json()) as {
          incoming?: CareCircleLinkRow[];
          outgoing?: CareCircleLinkRow[];
        };

        const incomingFamilyLinks = (linksPayload.incoming ?? []).filter(
          (link) =>
            typeof link.id === "string" &&
            link.id.trim().length > 0 &&
            link.status === "accepted" &&
            link.role === "family"
        );
        const outgoingFamilyLinks = (linksPayload.outgoing ?? []).filter(
          (link) =>
            typeof link.id === "string" &&
            link.id.trim().length > 0 &&
            link.status === "accepted" &&
            link.role === "family"
        );

        const appointmentNotifications: FamilyAppointmentNotification[] = [];
        const medicationNotifications: FamilyMedicationNotification[] = [];
        const vaultNotifications: FamilyVaultNotification[] = [];
        const joinRequestNotifications: FamilyJoinRequestNotification[] = [];

        const latestAcceptedOutgoing = outgoingFamilyLinks
          .map((link) => {
            const acceptedAt =
              typeof link.updatedAt === "string" && link.updatedAt.trim()
                ? link.updatedAt
                : link.createdAt;
            const acceptedTime = Date.parse(acceptedAt);
            if (!Number.isFinite(acceptedTime)) return null;
            const ageMs = nowTime - acceptedTime;
            if (ageMs < 0 || ageMs > ACCEPTED_NOTIFICATION_TTL_MS) return null;
            return { link, acceptedAt, acceptedTime };
          })
          .filter(
            (
              row
            ): row is {
              link: CareCircleLinkRow;
              acceptedAt: string;
              acceptedTime: number;
            } => row !== null
          )
          .sort((a, b) => b.acceptedTime - a.acceptedTime)[0];

        const acceptanceNotification: FamilyAcceptanceNotification | null = latestAcceptedOutgoing
          ? {
              id: `family-accepted:${latestAcceptedOutgoing.link.id}`,
              familyId: latestAcceptedOutgoing.link.id,
              familyName:
                latestAcceptedOutgoing.link.displayName?.trim() || "your care circle member",
              createdAt: latestAcceptedOutgoing.acceptedAt,
            }
          : null;

        if (incomingFamilyLinks.length > 0) {
          const detailResults = await Promise.all(
            incomingFamilyLinks.map(async (link) => {
              try {
                const response = await fetch(
                  `/api/care-circle/member/details?linkId=${encodeURIComponent(link.id)}`,
                  { cache: "no-store" }
                );
                if (!response.ok) return null;
                const data = (await response.json()) as FamilyMemberDetailsResponse;
                return { link, data };
              } catch {
                return null;
              }
            })
          );

          detailResults.forEach((result) => {
            if (!result?.data) return;
            const memberName =
              result.link.displayName?.trim() ||
              result.data.personal?.display_name?.trim() ||
              "Member";
            const memberAppointments = Array.isArray(result.data.appointments)
              ? result.data.appointments
              : [];
            memberAppointments.forEach((appointment) => {
              const appointmentDate =
                typeof appointment.date === "string" ? appointment.date : "";
              const appointmentTime =
                typeof appointment.time === "string" ? appointment.time : "";
              if (!appointmentDate || !appointmentTime) return;
              const appointmentId =
                typeof appointment.id === "string" && appointment.id.trim()
                  ? appointment.id
                  : `${appointmentDate}-${appointmentTime}-${appointment.title || appointment.type || "appointment"}`;
              const normalizedAppointment: Appointment = {
                id: appointmentId,
                date: appointmentDate,
                time: appointmentTime,
                title: appointment.title || "",
                type: appointment.type || "Appointment",
              };
              const dateTime = parseAppointmentDateTime(normalizedAppointment);
              if (!dateTime) return;
              const diffMs = dateTime.getTime() - nowTime;
              if (diffMs <= 0 || diffMs > ONE_DAY_MS) return;
              appointmentNotifications.push({
                id: `family-appointment:${result.link.id}:${appointmentId}`,
                memberId: result.link.id,
                memberName,
                appointment: normalizedAppointment,
                dateTime,
              });
            });

            const memberMedications = Array.isArray(result.data.medications)
              ? result.data.medications
              : [];
            memberMedications.forEach((medication) => {
              const name =
                typeof medication.name === "string" ? medication.name.trim() : "";
              const startDate =
                typeof medication.startDate === "string" ? medication.startDate.trim() : "";
              if (!name || !startDate) return;
              const start = new Date(`${startDate}T00:00:00`);
              if (Number.isNaN(start.getTime())) return;
              const diffMs = nowTime - start.getTime();
              if (diffMs < 0 || diffMs > ONE_DAY_MS) return;
              const medicationId =
                typeof medication.id === "string" && medication.id.trim()
                  ? medication.id
                  : name;
              medicationNotifications.push({
                id: `family-medication:${result.link.id}:${medicationId}:${startDate}`,
                memberId: result.link.id,
                memberName,
                medicationName: name,
                startDate,
              });
            });
          });

          const sinceIso = new Date(nowTime - ONE_DAY_MS).toISOString();
          const vaultResults = await Promise.all(
            incomingFamilyLinks.map(async (link) => {
              try {
                const response = await fetch(
                  `/api/care-circle/member/vault?linkId=${encodeURIComponent(
                    link.id
                  )}&category=all&limit=5&includeSigned=0&since=${encodeURIComponent(sinceIso)}`,
                  { cache: "no-store" }
                );
                if (!response.ok) return null;
                const data = (await response.json()) as { files?: FamilyVaultFile[] };
                return { link, files: data.files ?? [] };
              } catch {
                return null;
              }
            })
          );

          vaultResults.forEach((result) => {
            if (!result?.files?.length) return;
            const memberName = result.link.displayName?.trim() || "Member";
            result.files.forEach((file) => {
              if (!file?.created_at) return;
              const createdAt = file.created_at;
              const createdTime = new Date(createdAt).getTime();
              if (Number.isNaN(createdTime)) return;
              if (nowTime - createdTime > ONE_DAY_MS) return;
              vaultNotifications.push({
                id: `family-vault:${result.link.id}:${file.folder}:${file.name}:${createdAt}`,
                memberId: result.link.id,
                memberName,
                fileName: file.name,
                createdAt,
                folder: file.folder,
              });
            });
          });
        }

        appointmentNotifications.sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
        vaultNotifications.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        medicationNotifications.sort(
          (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
        );

        if (!isActive) return;
        setFamilyJoinRequests(joinRequestNotifications);
        setFamilyAcceptance(acceptanceNotification);
        setFamilyAppointments(appointmentNotifications);
        setFamilyVaultUpdates(vaultNotifications);
        setFamilyMedicationStarts(medicationNotifications);
      } catch {
        if (!isActive) return;
        setFamilyNotificationsError("Unable to load family notifications.");
        setFamilyJoinRequests([]);
        setFamilyAcceptance(null);
        setFamilyAppointments([]);
        setFamilyVaultUpdates([]);
        setFamilyMedicationStarts([]);
      } finally {
        if (isActive) {
          setFamilyNotificationsLoading(false);
        }
      }
    };

    fetchFamilyNotifications();
    const interval = setInterval(fetchFamilyNotifications, 120_000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setSharedFamilyActivityLogs([]);
      return;
    }

    let isActive = true;

    const fetchSharedFamilyActivity = async () => {
      try {
        const response = await fetch("/api/care-circle/activity?limit=40&sinceHours=24", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Unable to load family activity notifications.");
        }
        const payload = (await response.json()) as { logs?: SharedActivityLogRow[] };
        if (!isActive) return;
        setSharedFamilyActivityLogs(Array.isArray(payload.logs) ? payload.logs : []);
      } catch {
        if (!isActive) return;
        setSharedFamilyActivityLogs([]);
      }
    };

    void fetchSharedFamilyActivity();
    const interval = setInterval(fetchSharedFamilyActivity, 120_000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [userId]);

  useEffect(() => {
    let isActive = true;

    const loadInitialLogs = async () => {
      if (!profileId) {
        if (!isActive) return;
        setActivityLogs([]);
        setLogsError("");
        setLogsOffset(0);
        setLogsHasMore(false);
        setLogsLoading(false);
        return;
      }

      setLogsLoading(true);
      setLogsError("");
      try {
        const { data, error } = await supabase
          .from("profile_activity_logs")
          .select(
            "id, profile_id, source, domain, action, actor_user_id, actor_display_name, entity_id, entity_label, metadata, created_at"
          )
          .eq("profile_id", profileId)
          .eq("source", "care_circle")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(0, LOGS_PAGE_SIZE);

        if (error) throw error;

        const rows = (data ?? []) as ActivityLogRow[];
        const hasMore = rows.length > LOGS_PAGE_SIZE;
        const nextRows = hasMore ? rows.slice(0, LOGS_PAGE_SIZE) : rows;

        if (!isActive) return;
        setActivityLogs(nextRows);
        setLogsOffset(nextRows.length);
        setLogsHasMore(hasMore);
      } catch {
        if (!isActive) return;
        setActivityLogs([]);
        setLogsOffset(0);
        setLogsHasMore(false);
        setLogsError("Unable to load logs.");
      } finally {
        if (isActive) {
          setLogsLoading(false);
        }
      }
    };

    void loadInitialLogs();

    return () => {
      isActive = false;
    };
  }, [profileId, userId]);

  useEffect(() => {
    const updateNow = () => {
      setNowEpoch(Date.now());
    };

    const kickoff = window.setTimeout(updateNow, 0);
    const interval = window.setInterval(updateNow, 60_000);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(interval);
    };
  }, []);

  const formatRelativeTimestamp = (value: string) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Just now";
    if (nowEpoch === 0) return "Just now";

    const diffMs = nowEpoch - parsed.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;

    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const formatTimeUntil = (target: Date) => {
    if (nowEpoch === 0) return "Soon";
    const diffMs = target.getTime() - nowEpoch;
    if (diffMs <= 0) return "Starting now";
    const diffMinutes = Math.floor(diffMs / 60_000);
    if (diffMinutes < 60) return `In ${diffMinutes}m`;
    const diffHours = Math.floor(diffMinutes / 60);
    return `In ${diffHours}h`;
  };

  const persistDismissedNotification = async (notificationId: string) => {
    if (!userId) return;
    try {
      await fetch("/api/notifications/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationIds: [notificationId],
          dismissed: true,
          read: true,
        }),
      });
    } catch {
      // Non-blocking state sync.
    }
  };

  const dismissInvite = (id: string) => {
    const notificationId = inviteNotificationId(id);
    setDismissedInviteIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setServerDismissedNotificationIds((prev) => {
      const next = new Set(prev);
      next.add(notificationId);
      return next;
    });
    void persistDismissedNotification(notificationId);
  };

  const dismissAppointment = (notificationId: string) => {
    setDismissedAppointmentIds((prev) => {
      const next = new Set(prev);
      next.add(notificationId);
      return next;
    });
    setServerDismissedNotificationIds((prev) => {
      const next = new Set(prev);
      next.add(notificationId);
      return next;
    });
    void persistDismissedNotification(notificationId);
  };

  const dismissFamilyNotification = (id: string) => {
    setDismissedFamilyNotificationIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setServerDismissedNotificationIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    void persistDismissedNotification(id);
  };

  const formatStartDate = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const getMetadataText = (metadata: Record<string, unknown>, key: string) => {
    const value = metadata[key];
    return typeof value === "string" ? value.trim() : "";
  };

  const isActivityMetadataChangeValue = (value: unknown): value is ActivityMetadataChangeValue =>
    value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";

  const getActivityMetadataChanges = (metadata: Record<string, unknown>): ActivityMetadataChange[] => {
    const value = metadata.changes;
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        const field = typeof row.field === "string" ? row.field.trim() : "";
        const label = typeof row.label === "string" ? row.label.trim() : "";
        if (!field || !label) return null;
        return {
          field,
          label,
          before: isActivityMetadataChangeValue(row.before) ? row.before : null,
          after: isActivityMetadataChangeValue(row.after) ? row.after : null,
        };
      })
      .filter((entry): entry is ActivityMetadataChange => entry !== null);
  };

  const formatDateOnlyValue = (value: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const parsed = new Date(`${value}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      }
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }
    return value;
  };

  const formatTimeOnlyValue = (value: string) => {
    const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(value);
    if (!timeMatch) return value;
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return value;
    const parsed = new Date(2000, 0, 1, hours, minutes, 0, 0);
    return parsed.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const humanizeCodeValue = (value: string) => {
    if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)+$/i.test(value)) return value;
    return value
      .replace(/[_-]+/g, " ")
      .toLowerCase()
      .replace(/^\w/, (char) => char.toUpperCase());
  };

  const formatActivityMetadataValue = (
    value: ActivityMetadataChangeValue,
    domain: ActivityLogDomain,
    field: string
  ) => {
    if (value === null) return "cleared";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "cleared";
    const trimmed = value.trim();
    if (!trimmed) return "cleared";
    if (domain === "appointment" && field === "date") {
      return formatDateOnlyValue(trimmed);
    }
    if (domain === "appointment" && field === "time") {
      return formatTimeOnlyValue(trimmed);
    }
    if (domain === "medication" && field === "frequency") {
      return humanizeCodeValue(trimmed);
    }
    if (domain === "medication" && field === "timesPerDay") {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric) && numeric >= 0) {
        return `${numeric} times/day`;
      }
    }
    return trimmed;
  };

  const formatActivityChangeItems = (
    changes: ActivityMetadataChange[],
    domain: ActivityLogDomain
  ) => {
    if (changes.length === 0) return [];
    return changes.map((change) => {
        const before = formatActivityMetadataValue(change.before, domain, change.field);
        const after = formatActivityMetadataValue(change.after, domain, change.field);
        return {
          label: change.label,
          before,
          after,
        };
      });
  };

  const renderLogDetails = (logText: ActivityLogText) => {
    if (logText.changeItems && logText.changeItems.length > 0) {
      const truncateInlineValue = (value: string, maxLength = 18) =>
        value.length > maxLength ? `${value.slice(0, Math.max(maxLength - 1, 1))}…` : value;
      return (
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
          {logText.changeItems.map((change, index) => (
            <span key={`${change.label}-${index}`}>
              {index > 0 ? <span className="text-slate-400"> · </span> : null}
              <span className="text-slate-600">{change.label}: </span>
              <span className="text-rose-600">{truncateInlineValue(change.before)}</span>
              <span className="text-slate-400">→</span>
              <span className="text-emerald-700">{truncateInlineValue(change.after)}</span>
            </span>
          ))}
        </p>
      );
    }
    if (logText.details) {
      return <p className="mt-0.5 text-[11px] text-slate-500">{logText.details}</p>;
    }
    return null;
  };

  const getLogCardTheme = (domain: ActivityLogDomain) => {
    if (domain === "vault") {
      return {
        cardClassName:
          "group relative w-full rounded-2xl border border-slate-100 bg-sky-50/80 p-3 text-left transition hover:bg-white hover:shadow-sm",
        ringClassName: "group-hover:ring-sky-100",
        iconClassName: "bg-sky-100 text-sky-700",
        Icon: FileText,
      };
    }
    if (domain === "medication") {
      return {
        cardClassName:
          "group relative w-full rounded-2xl border border-slate-100 bg-emerald-50/80 p-3 text-left transition hover:bg-white hover:shadow-sm",
        ringClassName: "group-hover:ring-emerald-100",
        iconClassName: "bg-emerald-100 text-emerald-700",
        Icon: Pill,
      };
    }
    return {
      cardClassName:
        "group relative w-full rounded-2xl border border-slate-100 bg-amber-50/80 p-3 text-left transition hover:bg-white hover:shadow-sm",
      ringClassName: "group-hover:ring-amber-100",
      iconClassName: "bg-amber-100 text-amber-700",
      Icon: Calendar,
    };
  };

  const getActivityNavigationPath = (
    log: Pick<ActivityLogRow, "domain">,
    options?: { preferCareCircle?: boolean }
  ) => {
    if (options?.preferCareCircle) {
      return "/app/carecircle";
    }
    if (log.domain === "vault") {
      return "/app/vaultpage";
    }
    if (log.domain === "appointment") {
      return "/app/homepage?open=calendar";
    }
    if (log.domain === "medication") {
      return "/app/homepage?open=medications";
    }
    return "/app/homepage";
  };

  const getCareCircleMemberDetailsPath = (linkId: string, domain: ActivityLogDomain) =>
    `/app/carecircle?memberLinkId=${encodeURIComponent(linkId)}&tab=${encodeURIComponent(
      careCircleTabByDomain[domain]
    )}`;

  const getLogText = (log: ActivityLogRow): ActivityLogText => {
    const metadata =
      log.metadata && typeof log.metadata === "object"
        ? (log.metadata as Record<string, unknown>)
        : {};
    const actor = log.actor_display_name?.trim() || "Care circle member";
    const entityLabel = log.entity_label?.trim() || "item";

    if (log.domain === "vault") {
      const folder = getMetadataText(metadata, "folder");
      const typedFolder = folder as FamilyVaultFile["folder"];
      const folderLabel =
        folder && typedFolder in vaultFolderLabels ? vaultFolderLabels[typedFolder] : "Vault";
      if (log.action === "upload") {
        const fileName = getMetadataText(metadata, "fileName") || entityLabel;
        return {
          title: `${actor} uploaded a file`,
          subtitle: `${fileName} · ${folderLabel}`,
        };
      }
      if (log.action === "rename") {
        const fromName = getMetadataText(metadata, "fromName") || "Previous name";
        const toName = getMetadataText(metadata, "toName") || entityLabel;
        return {
          title: `${actor} renamed a file`,
          subtitle: `${fromName} → ${toName}`,
        };
      }
      const fileName = getMetadataText(metadata, "fileName") || entityLabel;
      return {
        title: `${actor} deleted a file`,
        subtitle: `${fileName} · ${folderLabel}`,
      };
    }

    if (log.domain === "medication") {
      const medicationName = getMetadataText(metadata, "name") || entityLabel;
      if (log.action === "add") {
        return {
          title: `${actor} added medication`,
          subtitle: medicationName,
        };
      }
      if (log.action === "update") {
        const changeItems = formatActivityChangeItems(
          getActivityMetadataChanges(metadata),
          "medication"
        );
        return {
          title: `${actor} updated medication`,
          subtitle: medicationName,
          changeItems,
          details: changeItems.length === 0 ? "Updated details" : undefined,
        };
      }
      return {
        title: `${actor} deleted medication`,
        subtitle: medicationName,
      };
    }

    const appointmentTitle = getMetadataText(metadata, "title") || entityLabel;
    if (log.action === "add") {
      return {
        title: `${actor} added appointment`,
        subtitle: appointmentTitle,
      };
    }
    if (log.action === "update") {
      const changeItems = formatActivityChangeItems(
        getActivityMetadataChanges(metadata),
        "appointment"
      );
      return {
        title: `${actor} updated appointment`,
        subtitle: appointmentTitle,
        changeItems,
        details: changeItems.length === 0 ? "Updated details" : undefined,
      };
    }
    return {
      title: `${actor} deleted appointment`,
      subtitle: appointmentTitle,
    };
  };

  const loadMoreLogs = async () => {
    if (!profileId || logsLoading || logsLoadingMore || !logsHasMore) return;

    setLogsLoadingMore(true);
    setLogsError("");
    try {
      const { data, error } = await supabase
        .from("profile_activity_logs")
        .select(
          "id, profile_id, source, domain, action, actor_user_id, actor_display_name, entity_id, entity_label, metadata, created_at"
        )
        .eq("profile_id", profileId)
        .eq("source", "care_circle")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(logsOffset, logsOffset + LOGS_PAGE_SIZE);

      if (error) throw error;

      const rows = (data ?? []) as ActivityLogRow[];
      const hasMore = rows.length > LOGS_PAGE_SIZE;
      const nextRows = hasMore ? rows.slice(0, LOGS_PAGE_SIZE) : rows;

      setActivityLogs((prev) => {
        const known = new Set(prev.map((entry) => entry.id));
        const uniqueNextRows = nextRows.filter((entry) => !known.has(entry.id));
        return [...prev, ...uniqueNextRows];
      });
      setLogsOffset((prev) => prev + nextRows.length);
      setLogsHasMore(hasMore);
    } catch {
      setLogsError("Unable to load more logs.");
    } finally {
      setLogsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "logs") return;
    if (!hasHydratedSeenLogs) return;
    if (logsLoading || activityLogs.length === 0) return;
    setSeenLogIds((previous) => {
      const next = new Set(previous);
      let changed = false;
      activityLogs.forEach((log) => {
        if (!log.id || next.has(log.id)) return;
        next.add(log.id);
        changed = true;
      });
      return changed ? next : previous;
    });
  }, [activeTab, activityLogs, hasHydratedSeenLogs, logsLoading]);

  const upcomingAppointments = allProfileAppointments
    .map((entry) => {
      const diffMs = entry.dateTime.getTime() - nowEpoch;
      if (diffMs <= 0 || diffMs > ONE_DAY_MS) return null;
      return {
        ...entry,
        diffMs,
      };
    })
    .filter(
      (
        item
      ): item is AccountAppointmentNotification & {
        diffMs: number;
      } => Boolean(item)
    )
    .filter((entry) => {
      if (dismissedAppointmentIds.has(entry.notificationId)) return false;
      return !serverDismissedNotificationIds.has(entry.notificationId);
    })
    .sort((a, b) => a.diffMs - b.diffMs);

  const visibleCareCircleInvites = careCircleInvites.filter((invite) => {
    if (dismissedInviteIds.has(invite.id)) return false;
    return !serverDismissedNotificationIds.has(inviteNotificationId(invite.id));
  });
  const visibleFamilyJoinRequests = familyJoinRequests.filter(
    (request) =>
      !dismissedFamilyNotificationIds.has(request.id) &&
      !serverDismissedNotificationIds.has(request.id)
  );
  const visibleFamilyAcceptance =
    familyAcceptance &&
    !dismissedFamilyNotificationIds.has(familyAcceptance.id) &&
    !serverDismissedNotificationIds.has(familyAcceptance.id)
      ? [familyAcceptance]
      : [];
  const visibleFamilyAppointments = familyAppointments
    .filter(({ dateTime }) => {
      const diffMs = dateTime.getTime() - nowEpoch;
      return diffMs > 0 && diffMs <= ONE_DAY_MS;
    })
    .filter(
      ({ id }) => !dismissedFamilyNotificationIds.has(id) && !serverDismissedNotificationIds.has(id)
    );
  const visibleFamilyVaultUpdates = familyVaultUpdates.filter((file) => {
    if (!file.createdAt) return false;
    const createdTime = new Date(file.createdAt).getTime();
    if (Number.isNaN(createdTime)) return false;
    if (nowEpoch === 0 || nowEpoch - createdTime > ONE_DAY_MS) return false;
    return !dismissedFamilyNotificationIds.has(file.id) && !serverDismissedNotificationIds.has(file.id);
  });
  const visibleFamilyMedicationStarts = familyMedicationStarts.filter((medication) => {
    const start = new Date(`${medication.startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return false;
    if (nowEpoch === 0) return false;
    const diffMs = nowEpoch - start.getTime();
    if (diffMs < 0 || diffMs > ONE_DAY_MS) return false;
    return (
      !dismissedFamilyNotificationIds.has(medication.id) &&
      !serverDismissedNotificationIds.has(medication.id)
    );
  });
  const hasSharedFamilyActivityLogs = sharedFamilyActivityLogs.length > 0;
  const visibleLegacyFamilyAppointments = hasSharedFamilyActivityLogs
    ? []
    : visibleFamilyAppointments;
  const visibleLegacyFamilyVaultUpdates = hasSharedFamilyActivityLogs ? [] : visibleFamilyVaultUpdates;
  const visibleLegacyFamilyMedicationStarts = hasSharedFamilyActivityLogs
    ? []
    : visibleFamilyMedicationStarts;
  const hasLegacyFamilyActivity =
    visibleLegacyFamilyAppointments.length > 0 ||
    visibleLegacyFamilyVaultUpdates.length > 0 ||
    visibleLegacyFamilyMedicationStarts.length > 0;
  const recentFamilyActivityLogs: SharedActivityLogRow[] =
    hasSharedFamilyActivityLogs
      ? sharedFamilyActivityLogs
      : hasLegacyFamilyActivity
        ? []
        : activityLogs
            .filter((log) => {
              const createdTime = Date.parse(log.created_at);
              if (!Number.isFinite(createdTime)) return false;
              if (nowEpoch === 0) return false;
              const ageMs = nowEpoch - createdTime;
              return ageMs >= 0 && ageMs <= ONE_DAY_MS;
            })
            .slice(0, 8);
  const visibleRecentFamilyActivityLogs = recentFamilyActivityLogs.filter(
    (log) => {
      const id = familyActivityNotificationId(log.id);
      return !dismissedFamilyNotificationIds.has(id) && !serverDismissedNotificationIds.has(id);
    }
  );
  const notificationIds = Array.from(
    new Set([
      ...upcomingAppointments.map((entry) => entry.notificationId),
      ...visibleFamilyJoinRequests.map((request) => request.id),
      ...visibleFamilyAcceptance.map((acceptance) => acceptance.id),
      ...visibleLegacyFamilyAppointments.map(({ id }) => id),
      ...visibleLegacyFamilyVaultUpdates.map((file) => file.id),
      ...visibleLegacyFamilyMedicationStarts.map((medication) => medication.id),
      ...visibleRecentFamilyActivityLogs.map((log) => familyActivityNotificationId(log.id)),
      ...visibleCareCircleInvites.map((invite) => inviteNotificationId(invite.id)),
    ])
  );
  const notificationIdsKey = JSON.stringify(notificationIds);

  useEffect(() => {
    setServerDismissedNotificationIds(new Set());
    syncedDismissedStateNotificationIdsKeyRef.current = "";
    setHasHydratedServerDismissedNotifications(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (notificationIds.length === 0) {
      if (!notificationsLoading && !familyNotificationsLoading) {
        setHasHydratedServerDismissedNotifications(true);
        syncedDismissedStateNotificationIdsKeyRef.current = "";
      }
      return;
    }
    if (syncedDismissedStateNotificationIdsKeyRef.current === notificationIdsKey) {
      setHasHydratedServerDismissedNotifications(true);
      return;
    }
    setHasHydratedServerDismissedNotifications(false);

    let isActive = true;

    const loadDismissedState = async () => {
      try {
        const parsedNotificationIds = JSON.parse(notificationIdsKey) as string[];
        const encodedIds = parsedNotificationIds.map((id) => encodeURIComponent(id)).join(",");
        const response = await fetch(`/api/notifications/state?ids=${encodedIds}`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          states?: Array<{ notification_id: string; dismissed_at: string | null }>;
        };
        if (!isActive) return;
        const dismissedIds = new Set<string>();
        (payload.states ?? []).forEach((state) => {
          if (!state?.notification_id) return;
          if (!state.dismissed_at) return;
          dismissedIds.add(state.notification_id);
        });
        setServerDismissedNotificationIds((previous) => {
          const next = new Set(previous);
          dismissedIds.forEach((id) => next.add(id));
          return next;
        });
        syncedDismissedStateNotificationIdsKeyRef.current = notificationIdsKey;
      } catch {
        // Non-blocking state sync.
      } finally {
        if (isActive) {
          setHasHydratedServerDismissedNotifications(true);
        }
      }
    };

    void loadDismissedState();

    return () => {
      isActive = false;
    };
  }, [familyNotificationsLoading, notificationIds.length, notificationIdsKey, notificationsLoading, userId]);

  useEffect(() => {
    if (activeTab !== "notifications") return;
    if (!hasHydratedSeenNotifications) return;
    if (!hasHydratedServerDismissedNotifications) return;
    if (notificationIds.length === 0) return;

    setSeenNotificationIds((previous) => {
      const next = new Set(previous);
      let changed = false;
      notificationIds.forEach((id) => {
        if (next.has(id)) return;
        next.add(id);
        changed = true;
      });
      return changed ? next : previous;
    });
  }, [activeTab, hasHydratedSeenNotifications, hasHydratedServerDismissedNotifications, notificationIds]);

  const totalNotifications =
    visibleCareCircleInvites.length +
    upcomingAppointments.length +
    visibleFamilyJoinRequests.length +
    visibleFamilyAcceptance.length +
    visibleLegacyFamilyAppointments.length +
    visibleLegacyFamilyVaultUpdates.length +
    visibleLegacyFamilyMedicationStarts.length +
    visibleRecentFamilyActivityLogs.length;
  const effectiveNotificationIds = hasHydratedServerDismissedNotifications ? notificationIds : [];
  const unreadNotificationsCount = effectiveNotificationIds.reduce(
    (count, id) => (seenNotificationIds.has(id) ? count : count + 1),
    0
  );
  const unreadLogsCount = activityLogs.reduce(
    (count, log) => (seenLogIds.has(log.id) ? count : count + 1),
    0
  );
  const isLoading = notificationsLoading || familyNotificationsLoading;
  const notificationError = notificationsError || familyNotificationsError;
  const isDismissedStateSyncing = !hasHydratedServerDismissedNotifications;
  const hasUnreadNotifications =
    hasHydratedSeenNotifications && unreadNotificationsCount > 0;
  const hasUnreadLogs = hasHydratedSeenLogs && unreadLogsCount > 0;
  const wrapperClassName =
    variant === "modal" ? "flex justify-center" : "hidden lg:flex justify-end";
  const panelClassName =
    variant === "modal"
      ? "w-full max-w-md h-[420px]"
      : "w-full max-w-sm h-[420px]";

  return (
    <div className={wrapperClassName}>
      <div className={`bg-white rounded-3xl shadow-lg transition border flex flex-col ${panelClassName}`}>
        <div className="px-6 py-5 border-b">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center">
              <Bell size={18} className="text-teal-600" />
            </div>
            <h3 className="font-bold text-lg">Notifications</h3>
            {hasHydratedSeenNotifications && unreadNotificationsCount > 0 && (
              <span className="ml-auto rounded-full bg-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-700">
                {unreadNotificationsCount} unread
              </span>
            )}
          </div>
          <div className="mt-4 flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("notifications")}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                activeTab === "notifications"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              aria-pressed={activeTab === "notifications"}
            >
              <span className="inline-flex items-center gap-1.5">
                <span>Notifications</span>
                {hasUnreadNotifications ? (
                  <span className="inline-block h-2 w-2 rounded-full bg-teal-500" />
                ) : null}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("logs")}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                activeTab === "logs"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              aria-pressed={activeTab === "logs"}
            >
              <span className="inline-flex items-center gap-1.5">
                <span>Logs</span>
                {hasUnreadLogs ? (
                  <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                ) : null}
              </span>
            </button>
          </div>
        </div>
        {activeTab === "notifications" ? (
          isDismissedStateSyncing ? (
            <div className="flex-1 flex items-center justify-center px-6 py-4 text-sm text-slate-500">
              Checking for updates...
            </div>
          ) : isLoading && totalNotifications === 0 ? (
            <div className="flex-1 flex items-center justify-center px-6 py-4 text-sm text-slate-500">
              Checking for updates...
            </div>
          ) : notificationError && totalNotifications === 0 ? (
            <div className="flex-1 flex items-center justify-center px-6 py-4 text-sm text-rose-600">
              {notificationError}
            </div>
          ) : totalNotifications === 0 ? (
            <div className="flex-1 flex items-center justify-center px-6 py-4 text-sm text-slate-500">
              No notifications yet
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {upcomingAppointments.map(({ notificationId, appointment, dateTime, profileLabel }) => (
                <button
                  key={notificationId}
                  type="button"
                  onClick={() => router.push("/app/homepage?open=calendar")}
                  className="group relative w-full rounded-2xl border border-slate-100 bg-amber-50/80 p-3 text-left transition hover:bg-white hover:shadow-sm"
                >
                  <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent transition group-hover:ring-amber-100" />
                  <span className="absolute right-2 top-2">
                    <span className="inline-flex rounded-full">
                      <span
                        role="button"
                        aria-label="Dismiss appointment notification"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dismissAppointment(notificationId);
                        }}
                        className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-600 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </span>
                    </span>
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Upcoming appointment</p>
                      <p className="text-xs text-slate-600">
                        {profileLabel ? `${profileLabel} · ` : ""}
                        {appointment.title || appointment.type} ·{" "}
                        {dateTime.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-500">{formatTimeUntil(dateTime)}</span>
                  </div>
                </button>
              ))}
              {visibleFamilyJoinRequests.map((request) => (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => router.push("/app/carecircle")}
                  className="group relative w-full rounded-2xl border border-slate-100 bg-indigo-50/80 p-3 text-left transition hover:bg-white hover:shadow-sm"
                >
                  <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent transition group-hover:ring-indigo-100" />
                  <span className="absolute right-2 top-2">
                    <span className="inline-flex rounded-full">
                      <span
                        role="button"
                        aria-label="Dismiss family join request notification"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dismissFamilyNotification(request.id);
                        }}
                        className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-600 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </span>
                    </span>
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Family join request</p>
                      <p className="text-xs text-slate-500">{request.requesterName} wants to join</p>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {formatRelativeTimestamp(request.createdAt)}
                    </span>
                  </div>
                </button>
              ))}
              {visibleFamilyAcceptance.map((acceptance) => (
                <button
                  key={acceptance.id}
                  type="button"
                  onClick={() => router.push("/app/carecircle")}
                  className="group relative w-full rounded-2xl border border-slate-100 bg-emerald-50/80 p-3 text-left transition hover:bg-white hover:shadow-sm"
                >
                  <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent transition group-hover:ring-emerald-100" />
                  <span className="absolute right-2 top-2">
                    <span className="inline-flex rounded-full">
                      <span
                        role="button"
                        aria-label="Dismiss family acceptance notification"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dismissFamilyNotification(acceptance.id);
                        }}
                        className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-600 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </span>
                    </span>
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Request approved</p>
                      <p className="text-xs text-slate-500">
                        {acceptance.familyName} accepted your care circle invite
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {acceptance.createdAt ? formatRelativeTimestamp(acceptance.createdAt) : "Just now"}
                    </span>
                  </div>
                </button>
              ))}
              {visibleLegacyFamilyAppointments.map(({ id, memberName, appointment, dateTime }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => router.push("/app/homepage?open=calendar")}
                  className="group relative w-full rounded-2xl border border-slate-100 bg-orange-50/80 p-3 text-left transition hover:bg-white hover:shadow-sm"
                >
                  <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent transition group-hover:ring-orange-100" />
                  <span className="absolute right-2 top-2">
                    <span className="inline-flex rounded-full">
                      <span
                        role="button"
                        aria-label="Dismiss family appointment notification"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dismissFamilyNotification(id);
                        }}
                        className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-600 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </span>
                    </span>
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Upcoming appointment</p>
                      <p className="text-xs text-slate-600">
                        {memberName} · {appointment.title || appointment.type} ·{" "}
                        {dateTime.toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-500">{formatTimeUntil(dateTime)}</span>
                  </div>
                </button>
              ))}
              {visibleLegacyFamilyVaultUpdates.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => router.push("/app/vaultpage")}
                  className="group relative w-full rounded-2xl border border-slate-100 bg-blue-50/80 p-3 text-left transition hover:bg-white hover:shadow-sm"
                >
                  <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent transition group-hover:ring-blue-100" />
                  <span className="absolute right-2 top-2">
                    <span className="inline-flex rounded-full">
                      <span
                        role="button"
                        aria-label="Dismiss vault notification"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dismissFamilyNotification(file.id);
                        }}
                        className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-600 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </span>
                    </span>
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">New vault document</p>
                      <p className="text-xs text-slate-500">
                        {file.memberName} added {file.fileName} · {vaultFolderLabels[file.folder]}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {formatRelativeTimestamp(file.createdAt)}
                    </span>
                  </div>
                </button>
              ))}
              {visibleLegacyFamilyMedicationStarts.map((medication) => (
                <button
                  key={medication.id}
                  type="button"
                  onClick={() => router.push("/app/homepage?open=medications")}
                  className="group relative w-full rounded-2xl border border-slate-100 bg-green-50/80 p-3 text-left transition hover:bg-white hover:shadow-sm"
                >
                  <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent transition group-hover:ring-green-100" />
                  <span className="absolute right-2 top-2">
                    <span className="inline-flex rounded-full">
                      <span
                        role="button"
                        aria-label="Dismiss medication notification"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dismissFamilyNotification(medication.id);
                        }}
                        className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-600 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </span>
                    </span>
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">New medication started</p>
                      <p className="text-xs text-slate-500">
                        {medication.memberName} started {medication.medicationName}
                      </p>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {formatStartDate(medication.startDate)}
                    </span>
                  </div>
                </button>
              ))}
              {visibleRecentFamilyActivityLogs.map((log) => {
                const { cardClassName, ringClassName, iconClassName, Icon } = getLogCardTheme(
                  log.domain
                );
                const logText = getLogText(log);
                const { title, subtitle } = logText;
                const sharedProfileLabel =
                  typeof log.profile_label === "string" ? log.profile_label.trim() : "";
                const subtitleText = sharedProfileLabel
                  ? `${subtitle} · ${sharedProfileLabel}`
                  : subtitle;
                const notificationId = familyActivityNotificationId(log.id);
                const deepLinkedPath =
                  typeof log.link_id === "string" && log.link_id.trim()
                    ? getCareCircleMemberDetailsPath(log.link_id.trim(), log.domain)
                    : null;
                const targetPath =
                  deepLinkedPath ||
                  getActivityNavigationPath(log, {
                    preferCareCircle: Boolean(sharedProfileLabel),
                  });
                return (
                  <button
                    key={notificationId}
                    type="button"
                    onClick={() => router.push(targetPath)}
                    className={cardClassName}
                  >
                    <span
                      className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent transition ${ringClassName}`}
                    />
                    <span className="absolute right-2 top-2">
                      <span className="inline-flex rounded-full">
                        <span
                          role="button"
                          aria-label="Dismiss family activity notification"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            dismissFamilyNotification(notificationId);
                          }}
                          className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-600 group-hover:opacity-100"
                        >
                          <X size={14} />
                        </span>
                      </span>
                    </span>
                    <div className="flex items-start justify-between gap-3 pr-8">
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg ${iconClassName}`}
                        >
                          <Icon size={14} />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{title}</p>
                          <p className="text-xs text-slate-500">{subtitleText}</p>
                          {renderLogDetails(logText)}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {formatRelativeTimestamp(log.created_at)}
                      </span>
                    </div>
                  </button>
                );
              })}
              {visibleCareCircleInvites.map((invite) => (
                <button
                  key={invite.id}
                  type="button"
                  onClick={() => router.push("/app/carecircle?open=incoming-invites")}
                  className="group relative w-full rounded-2xl border border-slate-100 bg-slate-50/80 p-3 text-left transition hover:bg-white hover:shadow-sm"
                >
                  <span className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent transition group-hover:ring-slate-100" />
                  <span className="absolute right-2 top-2">
                    <span className="inline-flex rounded-full">
                      <span
                        role="button"
                        aria-label="Dismiss care circle invite notification"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          dismissInvite(invite.id);
                        }}
                        className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-600 group-hover:opacity-100"
                      >
                        <X size={14} />
                      </span>
                    </span>
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Care circle invite</p>
                      <p className="text-xs text-slate-500">From {invite.name}</p>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {formatRelativeTimestamp(invite.createdAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : !profileId ? (
          <div className="flex-1 flex items-center justify-center px-6 py-4 text-sm text-slate-500">
            Select a profile to view logs.
          </div>
        ) : logsLoading && activityLogs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-6 py-4 text-sm text-slate-500">
            Loading logs...
          </div>
        ) : logsError && activityLogs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-6 py-4 text-sm text-rose-600">
            {logsError}
          </div>
        ) : activityLogs.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-6 py-4 text-sm text-slate-500">
            No logs yet
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {activityLogs.map((log) => {
              const { cardClassName, ringClassName, iconClassName, Icon } = getLogCardTheme(
                log.domain
              );
              const logText = getLogText(log);
              const { title, subtitle } = logText;
              const targetPath = getActivityNavigationPath(log);
              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => router.push(targetPath)}
                  className={cardClassName}
                >
                  <span
                    className={`pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-transparent transition ${ringClassName}`}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg ${iconClassName}`}
                      >
                        <Icon size={14} />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{title}</p>
                        <p className="text-xs text-slate-500">{subtitle}</p>
                        {renderLogDetails(logText)}
                      </div>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {formatRelativeTimestamp(log.created_at)}
                    </span>
                  </div>
                </button>
              );
            })}
            {logsHasMore ? (
              <button
                type="button"
                onClick={loadMoreLogs}
                disabled={logsLoadingMore}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {logsLoadingMore ? "Loading..." : "Load more"}
              </button>
            ) : null}
            {logsError ? (
              <p className="text-center text-xs text-rose-600">{logsError}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
