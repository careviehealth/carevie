import { NextRequest, NextResponse } from "next/server";

type RateLimitEntry = { count: number; resetAt: number };

/**
 * Simple in-memory sliding-window rate limiter.
 * Each instance tracks a single endpoint/action.
 * For production at scale, swap the Map for Redis.
 */
export function createRateLimiter(opts: {
  windowMs: number;
  maxRequests: number;
}) {
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup to prevent memory leaks (every 60 s)
  const CLEANUP_INTERVAL = 60_000;
  let lastCleanup = Date.now();

  function cleanup() {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    lastCleanup = now;
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }

  return {
    /**
     * Returns null if the request is allowed, or a 429 NextResponse if rate-limited.
     * `key` should be a stable identifier (IP, phone, userId, etc.).
     */
    check(key: string): NextResponse | null {
      cleanup();
      const now = Date.now();
      const entry = store.get(key);

      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + opts.windowMs });
        return null;
      }

      entry.count++;
      if (entry.count > opts.maxRequests) {
        const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
        return NextResponse.json(
          { error: "Too many requests. Please try again later." },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfterSec) },
          }
        );
      }

      return null;
    },
  };
}

/**
 * Extract a best-effort client IP from a Next.js request.
 * Falls back to "unknown" if headers are absent.
 */
export function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
