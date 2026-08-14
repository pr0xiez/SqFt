/** Allowed "rows per page" choices, shared by the server param parser and the
 *  client Pagination control so they can never drift. */
export const PER_PAGE_OPTIONS = [25, 50, 100] as const;

export const DEFAULT_PER_PAGE = 25;

export type PerPageOption = (typeof PER_PAGE_OPTIONS)[number];

/** Cap for the super-admin org list, which has no pagination UI (flat array
 *  response). 500 is far above any realistic org count today but bounds the
 *  unpaginated query; shared by the API route and the SSR page since both
 *  run the same `organization.findMany`. */
export const ADMIN_ORGS_LIST_CAP = 500;
