// Opportunistic drain for the notification job queue.
//
// Vercel Hobby only allows daily crons, so we can't rely on a 1-minute Vercel
// cron in prod. Instead, every notification-adjacent API call (bell list, prefs
// fetch, reconcile, push subscribe, etc.) triggers a fire-and-forget drain in
// the background. As long as anyone in the app touches notifications, due jobs
// flush within seconds.
//
// Throttled per-process: at most one in-flight drain at a time, with a
// minimum gap between starts to avoid hammering the DB during burst traffic.

import type { SupabaseClient } from '@supabase/supabase-js';
import { drainNotificationJobs } from './jobRunner';

const MIN_GAP_MS = 10_000; // at most one drain every 10s per server instance
const BATCH_LIMIT = 25;

type GlobalState = typeof globalThis & {
  __vytara_opportunistic_drain_running?: boolean;
  __vytara_opportunistic_drain_last_started?: number;
};

export const triggerOpportunisticDrain = (adminClient: SupabaseClient): void => {
  const g = globalThis as GlobalState;
  const now = Date.now();
  if (g.__vytara_opportunistic_drain_running) return;
  if (
    g.__vytara_opportunistic_drain_last_started &&
    now - g.__vytara_opportunistic_drain_last_started < MIN_GAP_MS
  ) {
    return;
  }
  g.__vytara_opportunistic_drain_running = true;
  g.__vytara_opportunistic_drain_last_started = now;

  // Fire-and-forget. Errors are swallowed (logged) — never block the API call
  // that triggered us.
  void (async () => {
    try {
      const result = await drainNotificationJobs(adminClient, {
        workerId: `opportunistic-${process.pid}-${now.toString(36)}`,
        limit: BATCH_LIMIT,
      });
      if (result.claimed > 0) {
        console.log(
          `[notifications] opportunistic drain: claimed=${result.claimed} completed=${result.completed} failed=${result.failed}`
        );
      }
    } catch (err) {
      console.warn(
        '[notifications] opportunistic drain failed:',
        err instanceof Error ? err.message : err
      );
    } finally {
      (globalThis as GlobalState).__vytara_opportunistic_drain_running = false;
    }
  })();
};
