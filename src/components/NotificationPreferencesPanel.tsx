"use client";

// Settings UI for notification delivery preferences:
//   * channel toggles (web push, in-app)
//   * per-category toggles (medication, appointment, care circle, vault, etc.)
//   * quiet hours window (HH:MM start + end, or off)
//   * timezone (autodetected; user can override)
//
// Saves on every change with a 500ms debounce so the user sees a "Saved"
// indicator without having to hit a Save button.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationPreferencesRow,
} from "@/lib/notifications/types";

type SaveState = "idle" | "saving" | "saved" | "error";

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  medication_due: "Medication reminders",
  medication_missed: "Missed medication alerts",
  appointment_upcoming: "Upcoming appointments",
  appointment_changed: "Appointment changes",
  care_circle_invite_received: "Care circle invites received",
  care_circle_invite_accepted: "Care circle invites accepted",
  care_circle_member_activity: "Care circle member activity",
  vault_document_uploaded: "Vault document uploads",
  medical_summary_ready: "Medical summary ready",
};

const CATEGORY_HINTS: Record<NotificationCategory, string> = {
  medication_due: "Ping me when a scheduled dose comes due.",
  medication_missed: "Tell me if a dose wasn't logged in time.",
  appointment_upcoming: "Remind me 24h, 2h, and 30m before an appointment.",
  appointment_changed: "Notify me when an appointment moves or cancels.",
  care_circle_invite_received: "Alert me when someone invites me to their circle.",
  care_circle_invite_accepted: "Tell me when an invite I sent is accepted.",
  care_circle_member_activity: "Notify me of edits made by my care circle.",
  vault_document_uploaded: "Alert me when new documents land in the vault.",
  medical_summary_ready: "Tell me when a fresh medical summary is generated.",
};

const detectTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const supportedTimezones = (): string[] => {
  const intlAny = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  if (typeof intlAny.supportedValuesOf === "function") {
    try {
      return intlAny.supportedValuesOf("timeZone");
    } catch {
      /* fall through */
    }
  }
  // Reasonable fallback if the runtime doesn't expose Intl.supportedValuesOf.
  return [
    "UTC",
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Kolkata",
    "Asia/Singapore",
    "Australia/Sydney",
  ];
};

type Props = {
  userId: string | null | undefined;
};

export default function NotificationPreferencesPanel({ userId }: Props) {
  const [prefs, setPrefs] = useState<NotificationPreferencesRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<number | null>(null);
  const timezones = useMemo(supportedTimezones, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const res = await fetch("/api/notifications/preferences", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as { preferences?: NotificationPreferencesRow };
        if (cancelled) return;
        setPrefs(json.preferences ?? null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load preferences");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const queueSave = useCallback((next: NotificationPreferencesRow) => {
    setSaveState("saving");
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/notifications/preferences", {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            timezone: next.timezone,
            channel_web_push: next.channel_web_push,
            channel_in_app: next.channel_in_app,
            category_prefs: next.category_prefs,
            quiet_hours_start: next.quiet_hours_start,
            quiet_hours_end: next.quiet_hours_end,
          }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as { preferences?: NotificationPreferencesRow };
        if (json.preferences) setPrefs(json.preferences);
        setSaveState("saved");
        window.setTimeout(() => setSaveState("idle"), 1500);
      } catch (err) {
        console.warn("[notifications] save preferences failed", err);
        setSaveState("error");
      }
    }, 500);
  }, []);

  const update = useCallback(
    (mutator: (current: NotificationPreferencesRow) => NotificationPreferencesRow) => {
      setPrefs((curr) => {
        if (!curr) return curr;
        const next = mutator(curr);
        queueSave(next);
        return next;
      });
    },
    [queueSave]
  );

  if (!userId) return null;
  if (loading && !prefs) {
    return <p className="text-sm text-[var(--theme-text-secondary)]">Loading preferences...</p>;
  }
  if (loadError && !prefs) {
    return (
      <p className="text-sm text-amber-700">
        Couldn&apos;t load preferences ({loadError}).
      </p>
    );
  }
  if (!prefs) return null;

  const detectedTz = detectTimezone();
  const tzMismatch = detectedTz !== prefs.timezone;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--theme-text)]">Delivery preferences</p>
          <p className="text-xs text-[var(--theme-text-secondary)]">
            Control which notifications reach you and when.
          </p>
        </div>
        <span className="text-[11px] text-[var(--theme-text-secondary)]">
          {saveState === "saving"
            ? "Saving..."
            : saveState === "saved"
              ? "Saved"
              : saveState === "error"
                ? "Save failed"
                : ""}
        </span>
      </div>

      <fieldset className="space-y-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--theme-text-secondary)]">
          Channels
        </legend>
        <ToggleRow
          label="In-app bell"
          hint="Show notifications inside the app's bell panel."
          checked={prefs.channel_in_app}
          onChange={(v) => update((c) => ({ ...c, channel_in_app: v }))}
        />
        <ToggleRow
          label="Browser push"
          hint="Send notifications to your browser even when the app is closed."
          checked={prefs.channel_web_push}
          onChange={(v) => update((c) => ({ ...c, channel_web_push: v }))}
        />
      </fieldset>

      <fieldset className="space-y-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--theme-text-secondary)]">
          Categories
        </legend>
        {NOTIFICATION_CATEGORIES.map((cat) => {
          const enabled = prefs.category_prefs[cat] !== false;
          return (
            <ToggleRow
              key={cat}
              label={CATEGORY_LABELS[cat]}
              hint={CATEGORY_HINTS[cat]}
              checked={enabled}
              onChange={(v) =>
                update((c) => ({
                  ...c,
                  category_prefs: { ...c.category_prefs, [cat]: v },
                }))
              }
            />
          );
        })}
      </fieldset>

      <fieldset className="space-y-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--theme-text-secondary)]">
          Quiet hours
        </legend>
        <p className="text-xs text-[var(--theme-text-secondary)]">
          Suppress browser pushes during these hours. Critical alerts (e.g. missed
          medication) still go through.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-[var(--theme-text-secondary)]">
            Start
            <input
              type="time"
              value={prefs.quiet_hours_start ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                update((c) => ({ ...c, quiet_hours_start: v }));
              }}
              className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--theme-text-secondary)]">
            End
            <input
              type="time"
              value={prefs.quiet_hours_end ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                update((c) => ({ ...c, quiet_hours_end: v }));
              }}
              className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)]"
            />
          </label>
        </div>
        {(prefs.quiet_hours_start || prefs.quiet_hours_end) ? (
          <button
            type="button"
            onClick={() => update((c) => ({ ...c, quiet_hours_start: null, quiet_hours_end: null }))}
            className="self-start text-[12px] text-[var(--theme-button-primary)] underline underline-offset-2"
          >
            Clear quiet hours
          </button>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--theme-text-secondary)]">
          Timezone
        </legend>
        <p className="text-xs text-[var(--theme-text-secondary)]">
          Used to interpret quiet-hours and reminder schedules. Detected:
          <span className="ml-1 font-medium text-[var(--theme-text)]">{detectedTz}</span>.
        </p>
        <select
          value={prefs.timezone}
          onChange={(e) => update((c) => ({ ...c, timezone: e.target.value }))}
          className="w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)]"
        >
          {timezones.includes(prefs.timezone) ? null : (
            <option value={prefs.timezone}>{prefs.timezone}</option>
          )}
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        {tzMismatch ? (
          <button
            type="button"
            onClick={() => update((c) => ({ ...c, timezone: detectedTz }))}
            className="self-start text-[12px] text-[var(--theme-button-primary)] underline underline-offset-2"
          >
            Use detected timezone ({detectedTz})
          </button>
        ) : null}
      </fieldset>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-transparent px-2 py-2 transition hover:border-[var(--theme-border)]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--theme-text)]">{label}</p>
        <p className="text-[11px] text-[var(--theme-text-secondary)]">{hint}</p>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 cursor-pointer accent-[var(--theme-button-primary)]"
      />
    </label>
  );
}
