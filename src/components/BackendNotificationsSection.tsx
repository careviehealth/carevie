"use client";

// Renders the canonical backend notification feed inside the bell panel.
// Polls /api/notifications/list, supports read/dismiss/snooze via
// /api/notifications/[id]/state, and routes clicks via deep_link.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarCheck,
  CalendarClock,
  Clock,
  FileText,
  Pill,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
  type LucideIcon,
} from "lucide-react";

import type { NotificationCategory, NotificationRow } from "@/lib/notifications/types";

const POLL_INTERVAL_MS = 20_000;

type Props = {
  userId: string | null | undefined;
  onUnreadChange?: (unread: number) => void;
};

type CategoryStyle = {
  Icon: LucideIcon;
  // Tailwind class fragments — kept literal so JIT can detect them.
  iconWrap: string;
  iconText: string;
  accent: string; // left-side stripe for unread cards
};

const CATEGORY_STYLES: Record<NotificationCategory, CategoryStyle> = {
  medication_due: {
    Icon: Pill,
    iconWrap: "bg-teal-50 ring-teal-100",
    iconText: "text-teal-600",
    accent: "from-teal-400 to-teal-500",
  },
  medication_missed: {
    Icon: AlertTriangle,
    iconWrap: "bg-amber-50 ring-amber-100",
    iconText: "text-amber-600",
    accent: "from-amber-400 to-amber-500",
  },
  appointment_upcoming: {
    Icon: CalendarClock,
    iconWrap: "bg-sky-50 ring-sky-100",
    iconText: "text-sky-600",
    accent: "from-sky-400 to-sky-500",
  },
  appointment_changed: {
    Icon: CalendarCheck,
    iconWrap: "bg-sky-50 ring-sky-100",
    iconText: "text-sky-600",
    accent: "from-sky-400 to-sky-500",
  },
  care_circle_invite_received: {
    Icon: UserPlus,
    iconWrap: "bg-violet-50 ring-violet-100",
    iconText: "text-violet-600",
    accent: "from-violet-400 to-violet-500",
  },
  care_circle_invite_accepted: {
    Icon: UserCheck,
    iconWrap: "bg-emerald-50 ring-emerald-100",
    iconText: "text-emerald-600",
    accent: "from-emerald-400 to-emerald-500",
  },
  care_circle_member_activity: {
    Icon: Activity,
    iconWrap: "bg-slate-100 ring-slate-200",
    iconText: "text-slate-600",
    accent: "from-slate-400 to-slate-500",
  },
  vault_document_uploaded: {
    Icon: FileText,
    iconWrap: "bg-indigo-50 ring-indigo-100",
    iconText: "text-indigo-600",
    accent: "from-indigo-400 to-indigo-500",
  },
  medical_summary_ready: {
    Icon: Sparkles,
    iconWrap: "bg-fuchsia-50 ring-fuchsia-100",
    iconText: "text-fuchsia-600",
    accent: "from-fuchsia-400 to-fuchsia-500",
  },
};

const FALLBACK_STYLE: CategoryStyle = {
  Icon: Bell,
  iconWrap: "bg-slate-100 ring-slate-200",
  iconText: "text-slate-600",
  accent: "from-slate-400 to-slate-500",
};

const formatRelative = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

type SnoozePreset = { label: string; iso: () => string };

const SNOOZE_PRESETS: SnoozePreset[] = [
  {
    label: "1 hour",
    iso: () => new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  },
  {
    label: "3 hours",
    iso: () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    label: "Tomorrow 8am",
    iso: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      return d.toISOString();
    },
  },
];

export function BackendNotificationsSection({ userId, onUnreadChange }: Props) {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSnoozeFor, setOpenSnoozeFor] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/list?limit=25", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`status ${res.status}`);
      }
      const json = (await res.json()) as { notifications?: NotificationRow[] };
      setRows(Array.isArray(json.notifications) ? json.notifications : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setRows([]);
      return;
    }
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, refresh]);

  const transition = useCallback(
    async (id: string, body: { read?: boolean; dismissed?: boolean; snoozedUntil?: string | null }) => {
      try {
        const res = await fetch(`/api/notifications/${id}/state`, {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
      } catch (err) {
        console.warn("[notifications] state transition failed", err);
      }
    },
    []
  );

  const handleDismiss = useCallback(
    async (id: string) => {
      setRows((prev) => prev.filter((r) => r.id !== id));
      await transition(id, { dismissed: true });
    },
    [transition]
  );

  const handleSnooze = useCallback(
    async (id: string, untilIso: string) => {
      setOpenSnoozeFor(null);
      // Hide locally — list endpoint will continue to omit until snooze elapses.
      setRows((prev) => prev.filter((r) => r.id !== id));
      await transition(id, { snoozedUntil: untilIso });
    },
    [transition]
  );

  const handleClick = useCallback(
    (row: NotificationRow) => {
      if (!row.read_at) {
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, read_at: new Date().toISOString() } : r))
        );
        void transition(row.id, { read: true });
      }
    },
    [transition]
  );

  const visible = useMemo(() => {
    const now = Date.now();
    return rows.filter((row) => {
      if (row.dismissed_at) return false;
      if (row.snoozed_until) {
        const ts = new Date(row.snoozed_until).getTime();
        if (Number.isFinite(ts) && ts > now) return false;
      }
      return true;
    });
  }, [rows]);

  const unreadCount = useMemo(() => visible.filter((r) => !r.read_at).length, [visible]);

  useEffect(() => {
    if (onUnreadChange) onUnreadChange(unreadCount);
  }, [unreadCount, onUnreadChange]);

  // Close any open snooze menu when the user clicks elsewhere.
  useEffect(() => {
    if (!openSnoozeFor) return;
    const onDocClick = () => setOpenSnoozeFor(null);
    window.addEventListener("click", onDocClick);
    return () => window.removeEventListener("click", onDocClick);
  }, [openSnoozeFor]);

  if (!userId) return null;

  if (visible.length === 0) {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <Bell className="h-5 w-5 animate-pulse text-slate-300" />
          <p className="text-[12px] text-slate-400">Loading notifications…</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <p className="text-[12px] text-amber-700">Couldn&apos;t load notifications.</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700 transition hover:bg-amber-100"
          >
            Retry
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50 ring-1 ring-slate-100">
          <Bell className="h-4 w-4 text-slate-400" />
        </div>
        <p className="text-[13px] font-medium text-slate-700">You&apos;re all caught up</p>
        <p className="text-[11px] text-slate-400">New notifications will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Recent
          </span>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {unreadCount}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="text-[11px] font-medium text-slate-400 transition hover:text-slate-700"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {visible.map((row) => {
          const style = CATEGORY_STYLES[row.category] ?? FALLBACK_STYLE;
          const Icon = style.Icon;
          const isUnread = !row.read_at;
          const snoozeOpen = openSnoozeFor === row.id;
          const card = (
            <div
              className={`group relative overflow-hidden rounded-2xl border bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 ease-out hover:-translate-y-px hover:border-slate-200 hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)] ${
                isUnread ? "border-slate-200" : "border-slate-100/80"
              }`}
            >
              {isUnread ? (
                <span
                  className={`absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b ${style.accent}`}
                  aria-hidden
                />
              ) : null}
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${style.iconWrap}`}
                >
                  <Icon className={`h-4 w-4 ${style.iconText}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`truncate text-[13px] leading-tight ${
                        isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-600"
                      }`}
                    >
                      {row.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        {formatRelative(row.scheduled_for)}
                      </span>
                      {isUnread ? (
                        <span
                          className={`h-1.5 w-1.5 rounded-full bg-gradient-to-br ${style.accent}`}
                          aria-label="Unread"
                        />
                      ) : null}
                    </div>
                  </div>
                  {row.body ? (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-slate-600">
                      {row.body}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpenSnoozeFor((curr) => (curr === row.id ? null : row.id));
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                        aria-label="Snooze"
                      >
                        <Clock className="h-3 w-3" />
                        Snooze
                      </button>
                      {snoozeOpen ? (
                        <div
                          className="absolute left-0 top-full z-20 mt-1.5 flex w-40 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {SNOOZE_PRESETS.map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleSnooze(row.id, preset.iso());
                              }}
                              className="px-3 py-2 text-left text-[12px] text-slate-700 transition hover:bg-slate-50"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleDismiss(row.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Dismiss"
                    >
                      <X className="h-3 w-3" />
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
          if (row.deep_link) {
            return (
              <li key={row.id}>
                <Link
                  href={row.deep_link}
                  onClick={() => handleClick(row)}
                  className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 rounded-2xl"
                >
                  {card}
                </Link>
              </li>
            );
          }
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => handleClick(row)}
                className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 rounded-2xl"
              >
                {card}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default BackendNotificationsSection;
