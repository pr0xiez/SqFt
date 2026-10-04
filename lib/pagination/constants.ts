/** Allowed "rows per page" choices, shared by the server param parser and the
 *  client Pagination control so they can never drift. */
export const PER_PAGE_OPTIONS = [25, 50, 100] as const;

export const DEFAULT_PER_PAGE = 25;

/** Defensive ceiling for "list all children of X" reads that are not
 *  paginated in their API contract (revisions of a site measure, invoices of
 *  an estimate, org members, admin org list). Far above any realistic count,
 *  so behavior is unchanged in practice, but memory/payload stay bounded. */
export const MAX_LIST_ROWS = 500;

export type PerPageOption = (typeof PER_PAGE_OPTIONS)[number];
