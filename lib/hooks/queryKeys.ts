/**
 * Central react-query key factory. Every `useQuery` key and every
 * `invalidateQueries` / `setQueryData` key goes through here, so a query and
 * the mutation meant to refresh it can't drift apart as independently-typed
 * string literals.
 *
 * Keys are prefix-matched by react-query: `keys.estimates.all` invalidates
 * every `estimates` query (lists, details, invoiceable, schedulable), while
 * `keys.estimates.detail(id)` matches only that detail.
 *
 * The first element of each key is load-bearing for the persistence policy in
 * `lib/queryCache.ts` (`PERSISTABLE` is keyed on `queryKey[0]`), which imports
 * `LINE_ITEM_TEMPLATES_ROOT` from here — keep them in sync by construction.
 */

type Id = string | number | null | undefined;

export const LINE_ITEM_TEMPLATES_ROOT = "line-item-templates";

export const keys = {
  customers: {
    all: ["customers"] as const,
    list: (params: unknown) => ["customers", params] as const,
    detail: (id: Id) => ["customers", id] as const,
    activity: (id: Id) => ["customers", id, "activity"] as const,
    /** Predicate for every customer activity feed (`["customers", id, "activity"]`). */
    isActivity: (queryKey: readonly unknown[]) =>
      queryKey[0] === "customers" && queryKey[2] === "activity",
  },
  locations: {
    all: ["locations"] as const,
    byCustomer: (customerId: Id) => ["locations", customerId] as const,
    search: (q: unknown) => ["locations", "search", q] as const,
  },
  siteMeasures: {
    all: ["siteMeasures"] as const,
    list: (params: unknown) => ["siteMeasures", params] as const,
    detail: (id: Id) => ["siteMeasures", id] as const,
  },
  estimates: {
    all: ["estimates"] as const,
    list: (params: unknown) => ["estimates", params] as const,
    detail: (id: Id) => ["estimates", id] as const,
    invoiceable: (q: unknown) => ["estimates", "invoiceable", q] as const,
    schedulable: ["estimates", "schedulable"] as const,
  },
  invoices: {
    all: ["invoices"] as const,
    /** Prefix of every org-wide invoice list query. */
    lists: ["invoices", "list"] as const,
    list: (params: unknown) => ["invoices", "list", params] as const,
    byEstimate: (estimateId: Id) =>
      ["invoices", "estimate", estimateId] as const,
    detail: (id: Id) => ["invoices", id] as const,
  },
  events: {
    all: ["events"] as const,
  },
  users: {
    all: ["users"] as const,
    assignable: ["users", "assignable"] as const,
  },
  lineItemTemplates: {
    all: [LINE_ITEM_TEMPLATES_ROOT] as const,
    list: (includeArchived: boolean) =>
      [LINE_ITEM_TEMPLATES_ROOT, { includeArchived }] as const,
  },
  dashboard: {
    kpis: ["dashboard", "kpis"] as const,
    revenue: ["dashboard", "revenue"] as const,
  },
  org: ["org"] as const,
  qboStatus: ["qbo-status"] as const,
  stripeConnect: ["stripe-connect"] as const,
  admin: {
    orgs: ["admin", "orgs"] as const,
    orgUsers: (orgId: string) => ["admin", "orgs", orgId, "users"] as const,
  },
};
