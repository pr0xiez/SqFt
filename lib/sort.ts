export type SortDirection = "asc" | "desc";

export type SortState<K extends string = string> = {
  key: K;
  direction: SortDirection;
};

/**
 * First click on a column applies `defaultDirection`; subsequent clicks on
 * the same column toggle asc⇄desc. Clicking a new column resets to that
 * column's `defaultDirection`. No "off" state — once sorted, always sorted.
 */
export function cycleSort<K extends string>(
  current: SortState<K> | null,
  key: K,
  defaultDirection: SortDirection = "asc"
): SortState<K> {
  if (!current || current.key !== key) {
    return { key, direction: defaultDirection };
  }
  return {
    key,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

const isNullish = (v: unknown) => v === null || v === undefined || v === "";

/**
 * Compare two non-null values. Numbers compare numerically; Dates compare
 * by time; everything else falls back to locale-aware string compare.
 */
function compareDefined(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  if (a instanceof Date || b instanceof Date) {
    const av =
      a instanceof Date ? a.getTime() : new Date(a as string).getTime();
    const bv =
      b instanceof Date ? b.getTime() : new Date(b as string).getTime();
    return av - bv;
  }
  return String(a).localeCompare(String(b), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

/**
 * Sort an array using a value-extractor keyed by sort key.
 * Pass `null` sort to leave the array as-is.
 */
export function sortBy<T, K extends string>(
  items: T[],
  sort: SortState<K> | null,
  accessors: Record<K, (item: T) => unknown>
): T[] {
  if (!sort) return items;
  const accessor = accessors[sort.key];
  if (!accessor) return items;
  const sign = sort.direction === "asc" ? 1 : -1;

  // Decorate-sort-undecorate preserves stability when keys tie. Nullish
  // values always sort last, regardless of direction, so empties don't
  // crowd the top of a "highest first" view.
  return items
    .map((item, idx) => ({ item, idx, key: accessor(item) }))
    .sort((a, b) => {
      const aNull = isNullish(a.key);
      const bNull = isNullish(b.key);
      if (aNull && bNull) return a.idx - b.idx;
      if (aNull) return 1;
      if (bNull) return -1;
      const cmp = compareDefined(a.key, b.key);
      if (cmp !== 0) return cmp * sign;
      return a.idx - b.idx;
    })
    .map((entry) => entry.item);
}
