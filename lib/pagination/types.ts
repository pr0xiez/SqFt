/**
 * Standard paginated list response.
 * - `items`: the rows for the requested page (already sliced server-side).
 * - `total`: count of rows matching the active filters (drives pageCount).
 * - `facets`: counts for the filter pills, keyed by pill value.
 */
export type Paginated<T> = {
  items: T[];
  total: number;
  facets: Record<string, number>;
};
