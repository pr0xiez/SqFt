/** Allowed "rows per page" choices, shared by the server param parser and the
 *  client Pagination control so they can never drift. */
export const PER_PAGE_OPTIONS = [25, 50, 100] as const;

export const DEFAULT_PER_PAGE = 25;

export type PerPageOption = (typeof PER_PAGE_OPTIONS)[number];
