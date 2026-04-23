// Dev-only background drain for the notification job queue.
//
// Vercel hits /api/cron/notifications every minute in production. Outside of
// Vercel (local `next dev`, self-hosted) nothing pulls jobs off the queue, so
// reminders silently sit there until the developer runs curl manually. This
// module starts a small in-process loop on server boot to keep things flowing
// without any operator action.
//
// Guarded against double-start when Next dev hot-reloads the module by stashing
// the timer on globalThis.

import { tryCreateSupabaseAdminClient } from '@/lib/supabaseAdmin';
import { drainNotificationJobs } from './jobRunner';

const INTERVAL_MS = 15_000;

type GlobalWithTimer = typeof globalThis & {
  __vytara_notif_drain_timer?: NodeJS.Timeout | null;
  __vytara_notif_drain_running?: boolean;
};

export const startNotificationsAutoDrain = (): void => {
  const g = globalThis as GlobalWithTimer;
  if (g.__vytara_notif_drain_timer) return;

  const tick = async () => {
    if (g.__vytara_notif_drain_running) return;
    g.__vytara_notif_drain_running = true;
    try {
      const adminClient = tryCreateSupabaseAdminClient();
      if (!adminClient) return; // service-role key not configured yet
      const result = await drainNotificationJobs(adminClient, {
        workerId: `dev-autocron-${process.pid}`,
        limit: 50,
      });
      if (result.claimed > 0) {
        console.log(
          `[notifications] auto-drain: claimed=${result.claimed} completed=${result.completed} failed=${result.failed}`
        );
      }
    } catch (err) {
      console.warn('[notifications] auto-drain failed:', err instanceof Error ? err.message : err);
    } finally {
      g.__vytara_notif_drain_running = false;
    }
  };

  // First tick after a short grace period so the dev server can finish wiring
  // env vars / database connections before the loop fires.
  setTimeout(() => void tick(), 5_000);
  g.__vytara_notif_drain_timer = setInterval(() => void tick(), INTERVAL_MS);
  console.log(`[notifications] dev auto-drain started (${INTERVAL_MS / 1000}s interval)`);
};
