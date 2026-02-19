/**
 * Simple in-memory fixed-window rate limiter middleware for Hono
 */

import type { MiddlewareHandler } from "hono";

interface RateLimitOptions {
  /** Max requests per window (default: 10) */
  max?: number;
  /** Window size in ms (default: 60000) */
  windowMs?: number;
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

export function rateLimit(options: RateLimitOptions = {}): MiddlewareHandler {
  const max = options.max ?? 10;
  const windowMs = options.windowMs ?? 60000;
  const buckets = new Map<string, BucketEntry>();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets) {
      if (entry.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  if (cleanup && typeof cleanup === "object" && "unref" in cleanup) {
    (cleanup as NodeJS.Timeout).unref();
  }

  return async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const now = Date.now();
    let bucket = buckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, bucket);
    }

    bucket.count++;

    if (bucket.count > max) {
      return c.json(
        { error: { code: "rate_limit_exceeded", message: "Too many requests, please try again later" } },
        429,
      );
    }

    await next();
  };
}
