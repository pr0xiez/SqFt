import { notFound } from "next/navigation";

/**
 * Validates a dynamic `[id]` route segment as a positive integer, calling
 * Next's `notFound()` on anything else — non-numeric, negative, zero, or
 * fractional — instead of letting `NaN`/a bogus id propagate into a data
 * fetch. Shared by every `[id]` builder page (`estimates`, `invoices`,
 * `customers`, `site-measures`).
 */
export function parseRouteId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  return id;
}
