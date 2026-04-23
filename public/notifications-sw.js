// Vytara notification service worker.
//
// Receives `push` events from the browser's push service and renders a system
// notification. On click, focuses an existing tab on the deep link or opens a
// new one.
//
// Payload contract (see src/lib/notifications/push.ts -> buildPushPayload):
//   { id, category, title, body, url, metadata, scheduled_for }

self.addEventListener('install', (event) => {
  // Activate the new SW as soon as it's installed.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

const FALLBACK_TITLE = 'Vytara';
const FALLBACK_BODY = 'You have a new update.';
const FALLBACK_ICON = '/carevie-mark.png';
const FALLBACK_BADGE = '/carevie-mark.png';

const parsePayload = (event) => {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch {
    try {
      return { title: FALLBACK_TITLE, body: event.data.text() };
    } catch {
      return null;
    }
  }
};

self.addEventListener('push', (event) => {
  const data = parsePayload(event) ?? {};
  const title = (data.title && String(data.title)) || FALLBACK_TITLE;
  const body = (data.body && String(data.body)) || FALLBACK_BODY;
  const url = (data.url && String(data.url)) || '/app/homepage';
  const tag = data.id ? `vytara:${data.id}` : data.category ? `vytara:${data.category}` : undefined;

  const options = {
    body,
    icon: FALLBACK_ICON,
    badge: FALLBACK_BADGE,
    tag,
    renotify: Boolean(tag),
    requireInteraction: data.category === 'medication_missed',
    data: {
      url,
      notificationId: data.id ?? null,
      category: data.category ?? null,
      metadata: data.metadata ?? {},
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = typeof data.url === 'string' && data.url ? data.url : '/app/homepage';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          try {
            const clientUrl = new URL(client.url);
            const targetParsed = new URL(targetUrl, self.location.origin);
            if (clientUrl.origin === targetParsed.origin) {
              client.focus();
              return client.navigate ? client.navigate(targetParsed.toString()) : undefined;
            }
          } catch {
            // ignore parse errors and try next client
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // The browser rotated the subscription. Try to resubscribe with the same
  // applicationServerKey and tell the backend the new endpoint. The page can
  // also reconcile this on next load — this handler is best-effort.
  event.waitUntil(
    (async () => {
      try {
        const oldEndpoint = event.oldSubscription ? event.oldSubscription.endpoint : null;
        const subscription = await self.registration.pushManager.getSubscription();
        if (!subscription) return;
        await fetch('/api/notifications/push/subscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
          credentials: 'include',
        });
        if (oldEndpoint) {
          await fetch('/api/notifications/push/unsubscribe', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ endpoint: oldEndpoint }),
            credentials: 'include',
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('[notifications-sw] resubscribe failed', err);
      }
    })()
  );
});
