-- Adds Expo Push Service support for the Vytara mobile app.
--
-- One transport, two changes:
--   1. notification_endpoints.channel now allows 'expo' alongside web_push/fcm/apns.
--      Expo Push tokens are unified across iOS + Android (ExponentPushToken[...]),
--      so we deliberately don't split into 'fcm' / 'apns' rows — the EPS relay
--      figures out the underlying provider from the token itself.
--   2. user_notification_preferences gains a `channel_mobile_push` toggle
--      mirroring `channel_web_push`. Defaults to true so existing users start
--      opted-in once they install the mobile app.
--
-- Endpoint hash for expo rows = sha256(expoPushToken). We persist the token
-- inside `subscription` jsonb (`{ "expoPushToken": "...", "deviceId": "..." }`)
-- so we don't have to widen the table just for one channel.

BEGIN;

ALTER TABLE public.notification_endpoints
  DROP CONSTRAINT IF EXISTS notification_endpoints_channel_check;

ALTER TABLE public.notification_endpoints
  ADD CONSTRAINT notification_endpoints_channel_check
  CHECK (channel IN ('web_push', 'fcm', 'apns', 'expo'));

ALTER TABLE public.user_notification_preferences
  ADD COLUMN IF NOT EXISTS channel_mobile_push boolean NOT NULL DEFAULT true;

COMMIT;
