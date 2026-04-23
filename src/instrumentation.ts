// Next.js instrumentation hook. Runs once per server process at boot.
//
// In dev (and any non-Vercel runtime), spawn an in-process drain loop so the
// notification queue is emptied without anyone having to hit /api/cron manually.
// On Vercel we rely on the cron defined in vercel.json — skipping the loop
// avoids double-draining and keeps cold-start cost down.

export const register = async () => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.VERCEL === '1') return;
  if (process.env.NOTIFICATIONS_DEV_AUTOCRON === '0') return;

  const { startNotificationsAutoDrain } = await import(
    './lib/notifications/devAutoDrain'
  );
  startNotificationsAutoDrain();
};
