/**
 * Authentication audit logging
 * Pattern: Darika style - structured JSON logging to stdout
 */

/** Supported auth event types */
export type AuthEventType =
  | "passkey_register_fail"
  | "passkey_login_fail"
  | "zkc_register_fail"
  | "zkc_auth_fail"
  | "session_expired"
  | "invalid_origin";

/** Structured auth audit event */
export interface AuthAuditEvent {
  timestamp: string;
  level: "warn" | "error";
  event: AuthEventType;
  userId?: string;
  ip: string;
  userAgent: string;
  details?: Record<string, unknown>;
}

/**
 * Log a structured auth audit event to stdout as JSON.
 *
 * @param event - The audit event to log
 */
export function logAuthEvent(event: AuthAuditEvent): void {
  console.log(JSON.stringify({ ...event, _tag: "auth_audit" }));
}

/**
 * Helper to extract IP and User-Agent from a Hono context.
 */
export function extractRequestMeta(c: {
  req: { header: (name: string) => string | undefined };
}): Pick<AuthAuditEvent, "ip" | "userAgent"> {
  return {
    ip:
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown",
    userAgent: c.req.header("user-agent") ?? "unknown",
  };
}
