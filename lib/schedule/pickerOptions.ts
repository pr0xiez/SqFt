export interface CustomerOption {
  id: number;
  name: string;
}

export interface EstimateOption {
  id: number;
  estimateNumber: number;
}

/**
 * Merge the server-searched rows with the currently selected entry so a
 * controlled <select> always has an <option> for its value (otherwise an
 * out-of-window selection renders blank). Deduped by id via a Map; the
 * selected entry is appended only when the search results lack it.
 */
export function withSelectedOption<T extends { id: number }>(
  results: readonly T[],
  selected: T | null | undefined
): T[] {
  const byId = new Map<number, T>();
  for (const r of results) byId.set(r.id, r);
  if (selected && !byId.has(selected.id)) byId.set(selected.id, selected);
  return Array.from(byId.values());
}

/** True when the server holds more rows than the picker received. */
export function isTruncated(total: number | undefined, shown: number): boolean {
  return total !== undefined && total > shown;
}
