/**
 * Rate limiting middleware (sliding window by IP)
 * Pattern: Darika style - typed middleware with Hono createMiddleware
 */

import { createMiddleware } from "hono/factory";
import { ApiException } from "#errors.js";

/** Rate limiter configuration */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  max: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/** Timestamped request entries per IP */
interface BucketEntry {
  timestamps: number[];
}

/** Default config: 100 requests per 60 seconds */
const DEFAULT_CONFIG: RateLimitConfig = { max: 100, windowMs: 60_000 };

/** Interval between cleanup sweeps (ms) */
const CLEANUP_INTERVAL_MS = 60_000;

/**
 * In-memory sliding window store.
 * One store per rateLimit() call so auth and global limits are independent.
 */
function createStore(windowMs: number) {
  const buckets = new Map<string, BucketEntry>();

  // Periodic cleanup of stale entries
  const timer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, entry] of buckets) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) {
        buckets.delete(ip);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow the process to exit without waiting for the timer
  if (timer.unref) timer.unref();

  return {
    /**
     * Record a hit and return the current count within the window.
     */
    hit(ip: string): number {
      const now = Date.now();
      const cutoff = now - windowMs;
      let entry = buckets.get(ip);
      if (!entry) {
        entry = { timestamps: [] };
        buckets.set(ip, entry);
      }
      // Prune old timestamps (sliding window)
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      entry.timestamps.push(now);
      return entry.timestamps.length;
    },

    /**
     * Return the oldest timestamp still in the window for Retry-After calculation.
     */
    oldestInWindow(ip: string): number | undefined {
      return buckets.get(ip)?.timestamps[0];
    },
  };
}

/**
 * Create a rate-limiting middleware for Hono.
 *
 * Adds standard rate-limit headers:
 * - `X-RateLimit-Limit`
 * - `X-RateLimit-Remaining`
 * - `Retry-After` (only when limit exceeded)
 */
export function rateLimit(config: Partial<RateLimitConfig> = {}) {
  const { max, windowMs } = { ...DEFAULT_CONFIG, ...config };
  const store = createStore(windowMs);

  return createMiddleware(async (c, next) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";

    const count = store.hit(ip);
    const remaining = Math.max(0, max - count);

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(remaining));

    if (count > max) {
      const oldest = store.oldestInWindow(ip);
      const retryAfterSec = oldest
        ? Math.ceil((oldest + windowMs - Date.now()) / 1000)
        : Math.ceil(windowMs / 1000);

      c.header("Retry-After", String(Math.max(1, retryAfterSec)));

      throw new ApiException(
        { code: "invalid_request", message: "Too many requests, please try again later" },
        429,
      );
    }

    await next();
  });
}
