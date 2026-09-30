/**
 * `session` callback's token→session mapping, extracted out of lib/auth.ts
 * as a pure/testable function (no imports at all, so nothing to boot).
 *
 * Throws on a malformed JWT (non-string `orgId`/`role`) so a corrupt or
 * tampered token can never propagate an unscoped session — this is the
 * guard the multi-tenancy boundary (lib/tenant.ts) ultimately relies on.
 */
export function mapTokenToSessionFields(token: {
  sub?: string | null;
  orgId?: unknown;
  role?: unknown;
}): { id: string; orgId: string; role: string } {
  if (typeof token.orgId !== "string" || typeof token.role !== "string") {
    throw new Error("Malformed JWT: orgId and role must be strings");
  }
  return {
    id: token.sub ?? "",
    orgId: token.orgId,
    role: token.role,
  };
}
