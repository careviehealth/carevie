import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

import { careCircleApi } from '@/api/modules/carecircle';
import type { Appointment } from '@/components/AppointmentsModal';
import { supabase } from '@/lib/supabase';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ACCEPTANCE_WINDOW_DAYS = 30;
const NOTIFICATION_REFRESH_MS = 60_000;
const seenNotificationsKey = (userId: string, profileId?: string) =>
  `vytara:seen-notifications:${userId}:${profileId ?? 'account'}`;
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

export function useNotifications(userId?: string, profileId?: string) {
  const [now, setNow] = useState(() => new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [careCircleInvites, setCareCircleInvites] = useState<CareCircleInvite[]>([]);
  const [careCircleAcceptances, setCareCircleAcceptances] = useState<CareCircleAcceptance[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [seenNotificationIds, setSeenNotificationIds] = useState<Set<string>>(() => new Set());
  const [hasHydratedSeen, setHasHydratedSeen] = useState(false);
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
        const parsed = JSON.parse(stored) as string[];
        localIds = new Set(parsed);
        foundLocal = true;
      }
    } catch {
      // Fall back to file storage below.
    }

    if (!foundLocal) {
      const fileStored = await readSeenFromFile(userId, profileId);
      if (fileStored) {
        try {
          const parsed = JSON.parse(fileStored) as string[];
          localIds = new Set(parsed);
          foundLocal = true;
        } catch {
          // Fall back to web storage below.
        }
      }
    }

    if (!foundLocal) {
      const webStorage = getWebStorage();
      if (webStorage) {
        const stored = webStorage.getItem(seenNotificationsKey(userId, profileId));
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as string[];
            localIds = new Set(parsed);
            foundLocal = true;
          } catch {
            // Ignore parse errors.
          }
        }
      }
    }

    let mergedIds = new Set(localIds);
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
      // Ignore remote fetch failures.
    }

    setSeenNotificationIds(mergedIds);
    setHasHydratedSeen(true);
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
        // Ignore and still fall back to file/web storage.
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
          // Ignore remote persistence failures.
        }
      }
    },
    [userId, profileId]
  );

  useEffect(() => {
    let isActive = true;
    const load = async () => {
      await loadSeenNotifications();
      if (!isActive) return;
    };
    void load();
    return () => {
      isActive = false;
    };
  }, [loadSeenNotifications]);

  useEffect(() => {
    if (!hasHydratedSeen) return;
    void persistSeenNotifications(seenNotificationIds);
  }, [persistSeenNotifications, seenNotificationIds, hasHydratedSeen]);

  const fetchNotifications = useCallback(async () => {
    if (!userId || !profileId) return;
    setNotificationsLoading(true);
    setNotificationsError(null);

    let hadError = false;
    let nextAppointments: Appointment[] | null = null;
    let nextInvites: CareCircleInvite[] | null = null;
    let nextAcceptances: CareCircleAcceptance[] | null = null;

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

    if (nextAppointments) setAppointments(nextAppointments);
    if (nextInvites) setCareCircleInvites(nextInvites);
    if (nextAcceptances) setCareCircleAcceptances(nextAcceptances);
    setNotificationsError(hadError ? 'Some notifications could not be refreshed.' : null);
    setNotificationsLoading(false);
  }, [userId, profileId]);

  useEffect(() => {
    if (!userId || !profileId) {
      setAppointments([]);
      setCareCircleInvites([]);
      setCareCircleAcceptances([]);
      setNotificationsLoading(false);
      setNotificationsError(null);
      return;
    }

    void fetchNotifications();
    const interval = setInterval(fetchNotifications, NOTIFICATION_REFRESH_MS);

    return () => {
      clearInterval(interval);
    };
  }, [userId, fetchNotifications]);

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

  const notificationIds = useMemo(() => {
    return [
      ...upcomingAppointments.map(({ appointment }) => notificationIdForAppointment(appointment.id)),
      ...pendingInvites.map((invite) => notificationIdForInvite(invite.id)),
      ...acceptedInvites.map((invite) => notificationIdForAcceptance(invite.id)),
    ];
  }, [upcomingAppointments, pendingInvites, acceptedInvites]);

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
        ({ appointment }) => !seenNotificationIds.has(notificationIdForAppointment(appointment.id))
      ),
    [upcomingAppointments, seenNotificationIds]
  );

  const readAppointments = useMemo(
    () =>
      upcomingAppointments.filter(({ appointment }) =>
        seenNotificationIds.has(notificationIdForAppointment(appointment.id))
      ),
    [upcomingAppointments, seenNotificationIds]
  );

  const unreadInvites = useMemo(
    () => pendingInvites.filter((invite) => !seenNotificationIds.has(notificationIdForInvite(invite.id))),
    [pendingInvites, seenNotificationIds]
  );

  const readInvites = useMemo(
    () => pendingInvites.filter((invite) => seenNotificationIds.has(notificationIdForInvite(invite.id))),
    [pendingInvites, seenNotificationIds]
  );

  const unreadAcceptances = useMemo(
    () =>
      acceptedInvites.filter(
        (invite) => !seenNotificationIds.has(notificationIdForAcceptance(invite.id))
      ),
    [acceptedInvites, seenNotificationIds]
  );

  const readAcceptances = useMemo(
    () =>
      acceptedInvites.filter((invite) =>
        seenNotificationIds.has(notificationIdForAcceptance(invite.id))
      ),
    [acceptedInvites, seenNotificationIds]
  );

  const markAllSeen = useCallback(() => {
    if (notificationIds.length === 0) return;
    setSeenNotificationIds((prev) => {
      const next = new Set(prev);
      notificationIds.forEach((id) => next.add(id));
      void persistSeenNotifications(next);
      return next;
    });
  }, [notificationIds, persistSeenNotifications]);

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
    hasUnseenNotifications,
    hasHydratedSeen,
    markAllSeen,
  };
}
