/**
 * Super-admin allowlist gate.
 *
 * Membership is controlled by the `SUPER_ADMIN_EMAILS` environment variable
 * (comma-separated). There is no DB column and no UI management surface —
 * changing the allowlist requires editing `.env.prd.local` and redeploying.
 *
 * Re-reads the env var on every call so test setup can mutate it freely.
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.SUPER_ADMIN_EMAILS ?? "";
  const target = email.toLowerCase();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim().toLowerCase();
    if (trimmed.length > 0 && trimmed === target) return true;
  }
  return false;
}
