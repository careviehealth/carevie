import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

import { careCircleApi, type SharedActivityLogRow } from '@/api/modules/carecircle';
import type { Appointment } from '@/components/AppointmentsModal';
import { supabase } from '@/lib/supabase';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ACCEPTANCE_WINDOW_DAYS = 30;
const NOTIFICATION_REFRESH_MS = 60_000;
const LOGS_PAGE_SIZE = 20;
const seenNotificationsKey = (userId: string, profileId?: string) =>
  `vytara:seen-notifications:${userId}:${profileId ?? 'account'}`;
const seenLogsKey = (userId: string, profileId?: string) =>
  `vytara:seen-logs:${userId}:${profileId ?? 'account'}`;
const seenNotificationsFile = (userId: string, profileId?: string) =>
  FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}vytara-notifications-${userId}-${profileId ?? 'account'}.json`
    : null;

export type CareCircleInvite = {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt?: string | null;
};

export type CareCircleAcceptance = {
  id: string;
  displayName: string;
  acceptedAt: string;
};

export type UpcomingAppointment = {
  appointment: Appointment;
  dateTime: Date;
  diffMs: number;
};

export type FamilyActivityNotification = {
  id: string;
  log: SharedActivityLogRow;
};

const notificationIdForAppointment = (id: string) => `appointment:${id}`;
const notificationIdForInvite = (id: string) => `invite:${id}`;
const notificationIdForAcceptance = (id: string) => `invite-accepted:${id}`;

const parseAppointmentDateTime = (appointment: Appointment) => {
  const parsed = new Date(`${appointment.date}T${appointment.time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getUpcomingAppointments = (appointments: Appointment[], now: Date) => {
  return appointments
    .map((appointment) => {
      const dateTime = parseAppointmentDateTime(appointment);
      if (!dateTime) return null;
      const diffMs = dateTime.getTime() - now.getTime();
      if (diffMs <= 0 || diffMs > ONE_DAY_MS) return null;
      return { appointment, dateTime, diffMs };
    })
    .filter((item): item is UpcomingAppointment => Boolean(item))
    .sort((a, b) => a.diffMs - b.diffMs);
};

type WebStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

const getWebStorage = (): WebStorage | null => {
  if (typeof globalThis === 'undefined') return null;
  const storage = (globalThis as { localStorage?: WebStorage }).localStorage;
  return storage ?? null;
};

const readSeenFromFile = async (userId: string, profileId?: string) => {
  const path = seenNotificationsFile(userId, profileId);
  if (!path) return null;
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const content = await FileSystem.readAsStringAsync(path);
    return content || null;
  } catch {
    return null;
  }
};

const writeSeenToFile = async (userId: string, payload: string, profileId?: string) => {
  const path = seenNotificationsFile(userId, profileId);
  if (!path) return;
  try {
    await FileSystem.writeAsStringAsync(path, payload);
  } catch {
    // Ignore file write failures.
  }
};

const notificationIdForFamilyActivity = (logId: string) => `family-activity:${logId}`;

export function useNotifications(userId?: string, profileId?: string) {
  const [now, setNow] = useState(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [careCircleInvites, setCareCircleInvites] = useState<CareCircleInvite[]>([]);
  const [careCircleAcceptances, setCareCircleAcceptances] = useState<CareCircleAcceptance[]>([]);
  const [familyActivityLogs, setFamilyActivityLogs] = useState<SharedActivityLogRow[]>([]);
  const [activityLogs, setActivityLogs] = useState<SharedActivityLogRow[]>([]);
  const [logsOffset, setLogsOffset] = useState(0);
  const [logsHasMore, setLogsHasMore] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoadingMore, setLogsLoadingMore] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [seenLogIds, setSeenLogIds] = useState<Set<string>>(() => new Set());
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(() => new Set());
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [seenNotificationIds, setSeenNotificationIds] = useState<Set<string>>(() => new Set());
  const [hasHydratedSeen, setHasHydratedSeen] = useState(false);
  const [hasHydratedSeenLogs, setHasHydratedSeenLogs] = useState(false);
  const lastRemotePersist = useRef<string>('');
  const realtimeDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), NOTIFICATION_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const loadSeenNotifications = useCallback(async () => {
    if (!userId || !profileId) {
      setSeenNotificationIds(new Set());
      setHasHydratedSeen(false);
      return;
    }
    let localIds = new Set<string>();
    let foundLocal = false;

    try {
      const stored = await SecureStore.getItemAsync(seenNotificationsKey(userId, profileId));
      if (stored) {
        localIds = new Set(JSON.parse(stored) as string[]);
        foundLocal = true;
      }
    } catch {
      /* fall back */
    }

    if (!foundLocal) {
      const fileStored = await readSeenFromFile(userId, profileId);
      if (fileStored) {
        try {
          localIds = new Set(JSON.parse(fileStored) as string[]);
          foundLocal = true;
        } catch {
          /* fall back */
        }
      }
    }

    if (!foundLocal) {
      const webStorage = getWebStorage();
      if (webStorage) {
        const stored = webStorage.getItem(seenNotificationsKey(userId, profileId));
        if (stored) {
          try {
            localIds = new Set(JSON.parse(stored) as string[]);
          } catch {
            /* ignore */
          }
        }
      }
    }

    const mergedIds = new Set(localIds);
    try {
      const { data } = await supabase.auth.getUser();
      const metadata = data?.user?.user_metadata as { notification_seen_ids?: unknown } | undefined;
      const remoteIds = metadata?.notification_seen_ids;
      if (Array.isArray(remoteIds)) {
        remoteIds.forEach((id) => {
          if (typeof id === 'string') mergedIds.add(id);
        });
      }
    } catch {
      /* ignore */
    }

    setSeenNotificationIds(mergedIds);
    setHasHydratedSeen(true);
  }, [userId, profileId]);

  const loadSeenLogs = useCallback(async () => {
    if (!userId || !profileId) {
      setSeenLogIds(new Set());
      setHasHydratedSeenLogs(false);
      return;
    }
    try {
      const stored = await SecureStore.getItemAsync(seenLogsKey(userId, profileId));
      if (stored) {
        setSeenLogIds(new Set(JSON.parse(stored) as string[]));
      }
    } catch {
      /* ignore */
    }
    setHasHydratedSeenLogs(true);
  }, [userId, profileId]);

  const persistSeenNotifications = useCallback(
    async (nextIds: Set<string>) => {
      if (!userId || !profileId) return;
      const arrayPayload = Array.from(nextIds);
      const payload = JSON.stringify(arrayPayload);
      const webStorage = getWebStorage();
      try {
        await SecureStore.setItemAsync(seenNotificationsKey(userId, profileId), payload);
      } catch {
        /* ignore */
      }
      await writeSeenToFile(userId, payload, profileId);
      if (webStorage) {
        webStorage.setItem(seenNotificationsKey(userId, profileId), payload);
      }
      if (payload !== lastRemotePersist.current) {
        lastRemotePersist.current = payload;
        try {
          await supabase.auth.updateUser({ data: { notification_seen_ids: arrayPayload } });
        } catch {
          /* ignore */
        }
      }
    },
    [userId, profileId]
  );

  const persistSeenLogs = useCallback(
    async (nextIds: Set<string>) => {
      if (!userId || !profileId) return;
      const payload = JSON.stringify(Array.from(nextIds));
      try {
        await SecureStore.setItemAsync(seenLogsKey(userId, profileId), payload);
      } catch {
        /* ignore */
      }
    },
    [userId, profileId]
  );

  useEffect(() => {
    void loadSeenNotifications();
  }, [loadSeenNotifications]);

  useEffect(() => {
    void loadSeenLogs();
  }, [loadSeenLogs]);

  useEffect(() => {
    if (!hasHydratedSeen) return;
    void persistSeenNotifications(seenNotificationIds);
  }, [persistSeenNotifications, seenNotificationIds, hasHydratedSeen]);

  useEffect(() => {
    if (!hasHydratedSeenLogs) return;
    void persistSeenLogs(seenLogIds);
  }, [persistSeenLogs, seenLogIds, hasHydratedSeenLogs]);

  const fetchNotifications = useCallback(async () => {
    if (!userId || !profileId) return;
    setNotificationsLoading(true);
    setNotificationsError(null);

    let hadError = false;
    let nextAppointments: Appointment[] | null = null;
    let nextInvites: CareCircleInvite[] | null = null;
    let nextAcceptances: CareCircleAcceptance[] | null = null;
    let nextFamilyActivity: SharedActivityLogRow[] | null = null;

    const { data, error } = await supabase
      .from('user_appointments')
      .select('appointments')
      .eq('profile_id', profileId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        nextAppointments = [];
      } else {
        console.error('Appointment notifications fetch error:', error);
        hadError = true;
      }
    } else {
      nextAppointments = (data?.appointments ?? []) as Appointment[];
    }

    try {
      const links = await careCircleApi.getLinks(profileId);
      nextInvites =
        links.incoming
          ?.filter((link) => link.status === 'pending')
          .map((link) => ({
            id: link.id,
            displayName: link.displayName,
            createdAt: link.createdAt,
            updatedAt: link.updatedAt,
          })) ?? [];
      nextAcceptances =
        links.outgoing
          ?.filter((link) => link.status === 'accepted')
          .map((link) => ({
            id: link.id,
            displayName: link.displayName,
            acceptedAt: link.updatedAt || link.createdAt,
          })) ?? [];
    } catch (err: any) {
      const message = err?.message ?? '';
      if (message.includes('EXPO_PUBLIC_API_URL') || message.includes('Missing')) {
        nextInvites = [];
        nextAcceptances = [];
      } else {
        console.error('Care circle notification fetch error:', err);
        hadError = true;
      }
    }

    try {
      const activityData = await careCircleApi.getActivity(40, 24);
      nextFamilyActivity = Array.isArray(activityData.logs) ? activityData.logs : [];
    } catch {
      nextFamilyActivity = [];
    }

    if (nextAppointments) setAppointments(nextAppointments);
    if (nextInvites) setCareCircleInvites(nextInvites);
    if (nextAcceptances) setCareCircleAcceptances(nextAcceptances);
    if (nextFamilyActivity) setFamilyActivityLogs(nextFamilyActivity);
    setNotificationsError(hadError ? 'Some notifications could not be refreshed.' : null);
    setNotificationsLoading(false);
  }, [userId, profileId]);

  const fetchActivityLogs = useCallback(async () => {
    if (!profileId) {
      setActivityLogs([]);
      setLogsOffset(0);
      setLogsHasMore(false);
      return;
    }
    setLogsLoading(true);
    setLogsError(null);
    try {
      const { data: rows, error: logsErr } = await supabase
        .from('profile_activity_logs')
        .select('id, profile_id, source, domain, action, actor_user_id, actor_display_name, entity_id, entity_label, metadata, created_at')
        .eq('profile_id', profileId)
        .eq('source', 'care_circle')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(0, LOGS_PAGE_SIZE);
      if (logsErr) throw logsErr;
      const allRows = (rows ?? []) as SharedActivityLogRow[];
      const hasMore = allRows.length > LOGS_PAGE_SIZE;
      const nextRows = hasMore ? allRows.slice(0, LOGS_PAGE_SIZE) : allRows;
      setActivityLogs(nextRows);
      setLogsOffset(nextRows.length);
      setLogsHasMore(hasMore);
    } catch {
      setActivityLogs([]);
      setLogsOffset(0);
      setLogsHasMore(false);
      setLogsError('Unable to load logs.');
    } finally {
      setLogsLoading(false);
    }
  }, [profileId]);

  const loadMoreLogs = useCallback(async () => {
    if (!profileId || logsLoadingMore || !logsHasMore) return;
    setLogsLoadingMore(true);
    try {
      const { data: rows, error: logsErr } = await supabase
        .from('profile_activity_logs')
        .select('id, profile_id, source, domain, action, actor_user_id, actor_display_name, entity_id, entity_label, metadata, created_at')
        .eq('profile_id', profileId)
        .eq('source', 'care_circle')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(logsOffset, logsOffset + LOGS_PAGE_SIZE);
      if (logsErr) throw logsErr;
      const allRows = (rows ?? []) as SharedActivityLogRow[];
      const hasMore = allRows.length > LOGS_PAGE_SIZE;
      const nextRows = hasMore ? allRows.slice(0, LOGS_PAGE_SIZE) : allRows;
      setActivityLogs((prev) => [...prev, ...nextRows]);
      setLogsOffset((prev) => prev + nextRows.length);
      setLogsHasMore(hasMore);
    } catch {
      setLogsError('Unable to load more logs.');
    } finally {
      setLogsLoadingMore(false);
    }
  }, [profileId, logsLoadingMore, logsHasMore, logsOffset]);

  useEffect(() => {
    if (!userId || !profileId) {
      setAppointments([]);
      setCareCircleInvites([]);
      setCareCircleAcceptances([]);
      setFamilyActivityLogs([]);
      setNotificationsLoading(false);
      setNotificationsError(null);
      return;
    }

    void fetchNotifications();
    void fetchActivityLogs();
    const interval = setInterval(fetchNotifications, NOTIFICATION_REFRESH_MS);

    return () => {
      clearInterval(interval);
    };
  }, [userId, profileId, fetchNotifications, fetchActivityLogs]);

  useEffect(() => {
    if (!userId || !profileId) return;

    const scheduleRefresh = () => {
      if (realtimeDebounce.current) {
        clearTimeout(realtimeDebounce.current);
      }
      realtimeDebounce.current = setTimeout(() => {
        void fetchNotifications();
      }, 500);
    };

    const channel = supabase.channel(`notifications-${userId}-${profileId}`);
    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'care_circle_links', filter: `requester_id=eq.${userId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'care_circle_links', filter: `recipient_id=eq.${userId}` },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_appointments', filter: `profile_id=eq.${profileId}` },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (realtimeDebounce.current) {
        clearTimeout(realtimeDebounce.current);
      }
      supabase.removeChannel(channel);
    };
  }, [userId, profileId, fetchNotifications]);

  const dismissNotification = useCallback(
    async (notificationId: string) => {
      setDismissedNotificationIds((prev) => {
        const next = new Set(prev);
        next.add(notificationId);
        return next;
      });
      try {
        await careCircleApi.updateNotificationStates([notificationId], { dismissed: true });
      } catch {
        /* non-blocking */
      }
    },
    []
  );

  const upcomingAppointments = useMemo(
    () => getUpcomingAppointments(appointments, now),
    [appointments, now]
  );

  const pendingInvites = useMemo(() => {
    return [...careCircleInvites].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [careCircleInvites]);

  const acceptedInvites = useMemo(() => {
    const cutoff = Date.now() - ACCEPTANCE_WINDOW_DAYS * ONE_DAY_MS;
    return [...careCircleAcceptances]
      .filter((invite) => {
        const ts = new Date(invite.acceptedAt).getTime();
        return Number.isFinite(ts) && ts >= cutoff;
      })
      .sort((a, b) => new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime());
  }, [careCircleAcceptances]);

  const visibleFamilyActivity = useMemo(() => {
    return familyActivityLogs.filter(
      (log) => !dismissedNotificationIds.has(notificationIdForFamilyActivity(log.id))
    );
  }, [familyActivityLogs, dismissedNotificationIds]);

  useEffect(() => {
    if (!userId) return;
    let isActive = true;

    const syncDismissed = async () => {
      const allIds = [
        ...upcomingAppointments.map(({ appointment }) => notificationIdForAppointment(appointment.id)),
        ...pendingInvites.map((inv) => notificationIdForInvite(inv.id)),
        ...acceptedInvites.map((inv) => notificationIdForAcceptance(inv.id)),
        ...familyActivityLogs.map((log) => notificationIdForFamilyActivity(log.id)),
      ];
      if (allIds.length === 0) return;
      try {
        const result = await careCircleApi.getNotificationStates(allIds);
        if (!isActive) return;
        const dismissed = new Set<string>();
        (result.states ?? []).forEach((state) => {
          if (state.dismissed_at) dismissed.add(state.notification_id);
        });
        if (dismissed.size > 0) {
          setDismissedNotificationIds((prev) => {
            const next = new Set(prev);
            dismissed.forEach((id) => next.add(id));
            return next;
          });
        }
      } catch {
        /* non-blocking */
      }
    };

    void syncDismissed();
    return () => { isActive = false; };
  }, [userId, upcomingAppointments, pendingInvites, acceptedInvites, familyActivityLogs]);

  const notificationIds = useMemo(() => {
    return [
      ...upcomingAppointments.map(({ appointment }) => notificationIdForAppointment(appointment.id)),
      ...pendingInvites.map((invite) => notificationIdForInvite(invite.id)),
      ...acceptedInvites.map((invite) => notificationIdForAcceptance(invite.id)),
      ...visibleFamilyActivity.map((log) => notificationIdForFamilyActivity(log.id)),
    ];
  }, [upcomingAppointments, pendingInvites, acceptedInvites, visibleFamilyActivity]);

  useEffect(() => {
    if (!hasHydratedSeen) return;
    setSeenNotificationIds((prev) => {
      if (notificationIds.length === 0) return prev;
      const allowed = new Set(notificationIds);
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (allowed.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [notificationIds, hasHydratedSeen]);

  const hasUnseenNotifications = useMemo(() => {
    if (notificationIds.length === 0) return false;
    return notificationIds.some((id) => !seenNotificationIds.has(id));
  }, [notificationIds, seenNotificationIds]);

  const unreadAppointments = useMemo(
    () =>
      upcomingAppointments.filter(
        ({ appointment }) =>
          !seenNotificationIds.has(notificationIdForAppointment(appointment.id)) &&
          !dismissedNotificationIds.has(notificationIdForAppointment(appointment.id))
      ),
    [upcomingAppointments, seenNotificationIds, dismissedNotificationIds]
  );

  const readAppointments = useMemo(
    () =>
      upcomingAppointments.filter(
        ({ appointment }) =>
          seenNotificationIds.has(notificationIdForAppointment(appointment.id)) &&
          !dismissedNotificationIds.has(notificationIdForAppointment(appointment.id))
      ),
    [upcomingAppointments, seenNotificationIds, dismissedNotificationIds]
  );

  const unreadInvites = useMemo(
    () =>
      pendingInvites.filter(
        (invite) =>
          !seenNotificationIds.has(notificationIdForInvite(invite.id)) &&
          !dismissedNotificationIds.has(notificationIdForInvite(invite.id))
      ),
    [pendingInvites, seenNotificationIds, dismissedNotificationIds]
  );

  const readInvites = useMemo(
    () =>
      pendingInvites.filter(
        (invite) =>
          seenNotificationIds.has(notificationIdForInvite(invite.id)) &&
          !dismissedNotificationIds.has(notificationIdForInvite(invite.id))
      ),
    [pendingInvites, seenNotificationIds, dismissedNotificationIds]
  );

  const unreadAcceptances = useMemo(
    () =>
      acceptedInvites.filter(
        (invite) =>
          !seenNotificationIds.has(notificationIdForAcceptance(invite.id)) &&
          !dismissedNotificationIds.has(notificationIdForAcceptance(invite.id))
      ),
    [acceptedInvites, seenNotificationIds, dismissedNotificationIds]
  );

  const readAcceptances = useMemo(
    () =>
      acceptedInvites.filter(
        (invite) =>
          seenNotificationIds.has(notificationIdForAcceptance(invite.id)) &&
          !dismissedNotificationIds.has(notificationIdForAcceptance(invite.id))
      ),
    [acceptedInvites, seenNotificationIds, dismissedNotificationIds]
  );

  const unreadFamilyActivity = useMemo(
    () =>
      visibleFamilyActivity.filter(
        (log) => !seenNotificationIds.has(notificationIdForFamilyActivity(log.id))
      ),
    [visibleFamilyActivity, seenNotificationIds]
  );

  const readFamilyActivity = useMemo(
    () =>
      visibleFamilyActivity.filter((log) =>
        seenNotificationIds.has(notificationIdForFamilyActivity(log.id))
      ),
    [visibleFamilyActivity, seenNotificationIds]
  );

  const unreadLogsCount = useMemo(() => {
    return activityLogs.reduce((count, log) => (seenLogIds.has(log.id) ? count : count + 1), 0);
  }, [activityLogs, seenLogIds]);

  const markAllSeen = useCallback(() => {
    if (notificationIds.length === 0) return;
    setSeenNotificationIds((prev) => {
      const next = new Set(prev);
      notificationIds.forEach((id) => next.add(id));
      void persistSeenNotifications(next);
      return next;
    });
  }, [notificationIds, persistSeenNotifications]);

  const markLogsSeen = useCallback(() => {
    if (activityLogs.length === 0) return;
    setSeenLogIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      activityLogs.forEach((log) => {
        if (!next.has(log.id)) {
          next.add(log.id);
          changed = true;
        }
      });
      if (changed) void persistSeenLogs(next);
      return changed ? next : prev;
    });
  }, [activityLogs, persistSeenLogs]);

  return {
    now,
    notificationsLoading,
    notificationsError,
    unreadAppointments,
    readAppointments,
    unreadInvites,
    readInvites,
    unreadAcceptances,
    readAcceptances,
    unreadFamilyActivity,
    readFamilyActivity,
    hasUnseenNotifications,
    hasHydratedSeen,
    markAllSeen,
    dismissNotification,
    activityLogs,
    logsLoading,
    logsLoadingMore,
    logsHasMore,
    logsError,
    loadMoreLogs,
    unreadLogsCount,
    markLogsSeen,
    hasHydratedSeenLogs,
  };
}
