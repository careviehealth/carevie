import crypto from "crypto";

export const REMEMBER_DEVICE_COOKIE_NAME = "vytara_device_token";

const parseMaxAge = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export const rememberDeviceCookieMaxAgeSeconds = parseMaxAge(
  process.env.REMEMBER_DEVICE_MAX_AGE_SECONDS,
  60 * 60 * 24 * 180
);

export const rememberDeviceCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: rememberDeviceCookieMaxAgeSeconds,
};

export const rememberDeviceCookieClearOptions = {
  ...rememberDeviceCookieOptions,
  maxAge: 0,
};

export const generateDeviceToken = () => crypto.randomBytes(32).toString("hex");

export const hashDeviceToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");
