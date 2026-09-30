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

/**
 * Build the shared "search box" OR clause used by the estimate/invoice/
 * site-measure list endpoints: a case-insensitive substring match on the
 * related customer's name, plus (when the cleaned query parses as a
 * Postgres-safe int4 via {@link searchableInt}) an equality match on the
 * entity's own number field. Trims `q` and strips a leading `#` (users often
 * paste "#123"). Returns `null` for an empty/whitespace query — callers skip
 * the search filter entirely in that case.
 *
 * The customer-name and number clauses are entity-specific — the relation
 * path to reach the customer, and which column holds the number, differ per
 * repo — so callers supply them as small builder functions rather than the
 * helper hardcoding a shape.
 */
export function buildSearchWhere<TWhere>(
  q: string,
  clauses: {
    customerName: (cleaned: string) => TWhere;
    number: (n: number) => TWhere;
  }
): { OR: TWhere[] } | null {
  const cleaned = q.trim().replace(/^#/, "");
  if (cleaned.length === 0) return null;
  const or: TWhere[] = [clauses.customerName(cleaned)];
  const n = searchableInt(cleaned);
  if (n !== null) or.push(clauses.number(n));
  return { OR: or };
}

/** A single row of a Prisma `groupBy({ by: ["status"], _count: { _all: true } })`.
 *  `_count`'s exact shape is a per-model Prisma-generated type, so it's kept
 *  loose here and narrowed at read time in {@link computeFacets}. */
export interface StatusGroupRow {
  status: string;
  _count: unknown;
}

/**
 * Turn a Prisma status `groupBy` result into a `{ all, ...perStatus }` facet
 * -counts object, seeded to 0 for every status in `statuses` so callers
 * (list pills) always get a complete set of counts even when a status has no
 * rows. `extraBuckets` — e.g. the invoices list's "open" pill, which sums
 * several statuses — adds further keys computed via a predicate over each
 * row's status.
 */
export function computeFacets(
  grouped: readonly StatusGroupRow[],
  statuses: readonly string[],
  extraBuckets?: Record<string, (status: string) => boolean>
): Record<string, number> {
  const facets: Record<string, number> = { all: 0 };
  for (const s of statuses) facets[s] = 0;
  for (const key of Object.keys(extraBuckets ?? {})) facets[key] = 0;

  for (const row of grouped) {
    const count = row._count;
    const n =
      typeof count === "object" && count !== null && "_all" in count
        ? ((count as { _all?: number | null })._all ?? 0)
        : 0;
    facets.all += n;
    if (statuses.includes(row.status)) facets[row.status] = n;
    for (const [key, matches] of Object.entries(extraBuckets ?? {})) {
      if (matches(row.status)) facets[key] += n;
    }
  }
  return facets;
}
