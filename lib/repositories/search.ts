/** Postgres int4 max — passing a larger value to an Int column makes Prisma
 *  throw `22003 integer out of range`. */
const PG_INT4_MAX = 2_147_483_647;

/**
 * Parse a cleaned search token as a Postgres-safe int4 for matching numeric
 * columns (estimate / invoice / site-measure numbers). Returns the number when
 * the token is all-digits and fits int4, otherwise `null` — callers then search
 * text only instead of issuing an out-of-range query that would 500.
 */
export function searchableInt(cleaned: string): number | null {
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) && n <= PG_INT4_MAX ? n : null;
}
