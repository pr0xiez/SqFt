import { randomBytes } from "node:crypto";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  ConflictError,
  EstimateLockedError,
  ValidationError,
} from "@/lib/api/errors";
import {
  ESTIMATE_STATUSES,
  isEstimateLocked,
  type OperatorEstimateStatus,
} from "@/lib/estimateStatus";
import type { EstimateStatusFilter } from "@/lib/estimates/statusFilter";
import { computeEstimateView, fromPrismaEstimate } from "@/lib/estimateView";
import type { Paginated } from "@/lib/pagination/types";
import { prisma } from "@/lib/prisma";
import {
  type InvoiceableCandidate,
  toInvoiceableCandidates,
} from "@/lib/quickCreate/candidates";
import { assertDeletable } from "@/lib/repositories/deleteGuards";
import { buildSearchWhere, computeFacets } from "@/lib/repositories/search";
import {
  type SchedulableCandidate,
  toSchedulableCandidates,
} from "@/lib/schedule/backlog";
import type { SortDirection } from "@/lib/sort";

function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Minimal hydrate shape `syncEstimateTotal` needs — matches the input of
 *  `fromPrismaEstimate` (markup/deposit rates + lineItems + siteMeasure
 *  items). Any of the standard estimate includes that bring lineItems and
 *  siteMeasure.items satisfies this. */
type HydratedForTotal = {
  markupPct: number;
  depositPct: number;
  lineItems: Parameters<typeof fromPrismaEstimate>[0]["lineItems"];
  siteMeasure: {
    items: Parameters<typeof fromPrismaEstimate>[0]["siteMeasure"]["items"];
  };
};

/** Recompute and persist Estimate.total inside an open transaction.
 *  `hydrated` must include lineItems and siteMeasure.items. Returns the
 *  computed total (null when there are no line items). */
async function syncEstimateTotal(
  tx: Prisma.TransactionClient,
  estimateId: number,
  hydrated: HydratedForTotal
): Promise<number | null> {
  const total =
    hydrated.lineItems.length === 0
      ? null
      : computeEstimateView(fromPrismaEstimate(hydrated)).total;
  await tx.estimate.update({ where: { id: estimateId }, data: { total } });
  return total;
}

/** `revisedFrom` / `revisedBy` pointer selects, shared by the detail include
 *  and the `EstimateWithDetails` payload type. */
const REVISED_PAIR_SELECT = {
  revisedFrom: { select: { id: true, estimateNumber: true } },
  revisedBy: { select: { id: true, estimateNumber: true } },
} satisfies Prisma.EstimateInclude;

/** Scalar fields of Estimate returned by the builder reads and the org-wide
 *  list — every column EXCEPT `approvalToken`. `approvalToken` is a live
 *  bearer credential for the unauthenticated `/estimate-review/[token]`
 *  approval flow (one-click POST, no other auth factor); it must never ride
 *  along in a payload an authenticated API route hands back to the browser.
 *  The only sanctioned reads of it are `rotateApprovalToken` (returns a
 *  freshly-minted token to the lead who explicitly requested one) and
 *  `getEstimateForSend` (server-only, feeds the send pipeline, never
 *  serialized to a client). See CONTEXT.md "Public tokens". */
const ESTIMATE_SCALAR_SELECT = {
  id: true,
  orgId: true,
  siteMeasureId: true,
  estimateNumber: true,
  status: true,
  date: true,
  markupPct: true,
  depositPct: true,
  terms: true,
  validityDays: true,
  sentAt: true,
  sentToEmail: true,
  sentByEmail: true,
  sentByName: true,
  viewedAt: true,
  approvedAt: true,
  declinedAt: true,
  declineReason: true,
  createdAt: true,
  total: true,
  revisedFromId: true,
} satisfies Prisma.EstimateSelect;

/** Full estimate-with-details select used by the builder reads
 *  (getEstimate / createEstimate / saveEstimate) and returned directly by
 *  their API routes — deliberately a `select`, not an `include`, so adding a
 *  sensitive scalar (like `approvalToken`) to the model doesn't silently
 *  start round-tripping it to the browser. */
const ESTIMATE_DETAILS_SELECT = {
  ...ESTIMATE_SCALAR_SELECT,
  siteMeasure: {
    include: {
      location: { include: { customer: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  },
  lineItems: { orderBy: { sortOrder: "asc" } },
  org: { select: { name: true, defaultDepositPct: true } },
  estimateEvents: {
    where: { type: "declined" },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
  ...REVISED_PAIR_SELECT,
} satisfies Prisma.EstimateSelect;

/**
 * Include used internally by the send pipeline (`getEstimateForSend`), which
 * needs the live `approvalToken` to decide whether to rotate before mailing
 * a fresh review link. Shape mirrors `ESTIMATE_DETAILS_SELECT` but as a plain
 * `include` (so it does carry the token) — safe ONLY because its one caller,
 * `lib/send/sendEstimate.ts`, never returns the loaded doc to the client (the
 * send route responds `{ ok: true }`). Do not reuse this include anywhere a
 * result is returned from an API route.
 */
const ESTIMATE_SEND_INCLUDE = {
  siteMeasure: {
    include: {
      location: { include: { customer: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  },
  lineItems: { orderBy: { sortOrder: "asc" } },
  org: { select: { name: true, defaultDepositPct: true } },
  estimateEvents: {
    where: { type: "declined" },
    orderBy: { createdAt: "desc" },
    take: 1,
  },
  ...REVISED_PAIR_SELECT,
} satisfies Prisma.EstimateInclude;

/** Include used by the public token read (getEstimateByToken). */
const ESTIMATE_PUBLIC_INCLUDE = {
  siteMeasure: {
    include: {
      location: { include: { customer: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  },
  lineItems: { orderBy: { sortOrder: "asc" } },
  org: {
    select: {
      name: true,
      phone: true,
      address: true,
      licenseNumber: true,
      logo: true,
      users: {
        where: { role: "admin" },
        orderBy: { id: "asc" },
        take: 1,
        select: { email: true },
      },
    },
  },
  approval: true,
} satisfies Prisma.EstimateInclude;

const ESTIMATE_LIST_SELECT = {
  ...ESTIMATE_SCALAR_SELECT,
  siteMeasure: {
    select: {
      id: true,
      siteMeasureNumber: true,
      location: {
        select: {
          id: true,
          address: true,
          customer: { select: { id: true, name: true } },
        },
      },
    },
  },
  _count: { select: { lineItems: true } },
} satisfies Prisma.EstimateSelect;

export type EstimateWithSiteMeasureSummary = Prisma.EstimateGetPayload<{
  select: typeof ESTIMATE_LIST_SELECT;
}>;

export type EstimateWithDetails = Prisma.EstimateGetPayload<{
  select: typeof ESTIMATE_DETAILS_SELECT;
}>;

/** Server-only payload for the send pipeline — carries `approvalToken`.
 *  See {@link ESTIMATE_SEND_INCLUDE}; never return this from an API route. */
export type EstimateForSend = Prisma.EstimateGetPayload<{
  include: typeof ESTIMATE_SEND_INCLUDE;
}>;

export type EstimateWithPublicView = Prisma.EstimateGetPayload<{
  include: typeof ESTIMATE_PUBLIC_INCLUDE;
}>;

type LineItemInput = Omit<
  Prisma.LineItemUncheckedCreateInput,
  "id" | "estimateId"
> & { id?: number };

// "approved"/"declined" are not settable via EstimatePatch/saveEstimate — see
// the guard at the top of saveEstimate. Those transitions only happen through
// approveEstimateByToken / declineEstimateByToken, which write the
// EstimateApproval consent record and run the supersede-siblings logic.
export type EstimatePatch = {
  status?: OperatorEstimateStatus;
  markupPct?: number;
  depositPct?: number;
  lineItems?: LineItemInput[];
};

export type EstimateSortKey =
  | "number"
  | "customer"
  | "siteMeasure"
  | "total"
  | "status"
  | "date";

export interface ListEstimatesParams {
  page: number;
  perPage: number;
  sort: { key: EstimateSortKey; direction: SortDirection };
  q: string;
  status: EstimateStatusFilter;
}

function estimateOrderBy(
  sort: ListEstimatesParams["sort"]
): Prisma.EstimateOrderByWithRelationInput {
  const dir = sort.direction;
  switch (sort.key) {
    case "number":
      return { estimateNumber: dir };
    case "status":
      return { status: dir };
    case "total":
      return { total: dir };
    case "customer":
      return { siteMeasure: { location: { customer: { name: dir } } } };
    case "siteMeasure":
      return { siteMeasure: { siteMeasureNumber: dir } };
    default:
      return { date: dir };
  }
}

function estimateSearchWhere(q: string): Prisma.EstimateWhereInput | null {
  return buildSearchWhere<Prisma.EstimateWhereInput>(q, {
    customerName: (cleaned) => ({
      siteMeasure: {
        location: {
          customer: { name: { contains: cleaned, mode: "insensitive" } },
        },
      },
    }),
    number: (n) => ({ estimateNumber: n }),
  });
}

export async function listEstimates(
  orgId: string,
  params: ListEstimatesParams
): Promise<Paginated<EstimateWithSiteMeasureSummary>> {
  const where: Prisma.EstimateWhereInput = { orgId };
  if (params.status !== "all") where.status = params.status;
  const search = estimateSearchWhere(params.q);
  if (search) Object.assign(where, search);

  const [items, total, grouped] = await prisma.$transaction([
    prisma.estimate.findMany({
      where,
      orderBy: estimateOrderBy(params.sort),
      skip: (params.page - 1) * params.perPage,
      take: params.perPage,
      select: ESTIMATE_LIST_SELECT,
    }),
    prisma.estimate.count({ where }),
    prisma.estimate.groupBy({
      by: ["status"],
      where: { orgId },
      _count: { _all: true },
      orderBy: undefined,
    }),
  ]);

  const facets = computeFacets(grouped, ESTIMATE_STATUSES);

  return { items, total, facets };
}

/**
 * Quick-invoice search: estimates whose customer matches `q` that still have a
 * billable balance (`unbilled > 0`). Drafts are included — billability is the
 * remaining balance, not a status gate, mirroring InvoicesSection. Returns the
 * org's default deposit pct alongside, so the invoice dialog can seed its %.
 */
export async function listInvoiceableEstimates(
  orgId: string,
  q: string,
  limit = 8
): Promise<{ items: InvoiceableCandidate[]; defaultDepositPct: number }> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { defaultDepositPct: true },
  });
  const defaultDepositPct = org?.defaultDepositPct ?? 0.3;

  const search = estimateSearchWhere(q);
  if (!search) return { items: [], defaultDepositPct };

  const rows = await prisma.estimate.findMany({
    where: { orgId, ...search },
    orderBy: { estimateNumber: "desc" },
    // Over-fetch then filter to unbilled>0 in pure code, so fully-billed
    // estimates don't crowd out billable ones within the result cap.
    take: limit * 4,
    select: {
      id: true,
      estimateNumber: true,
      status: true,
      total: true,
      siteMeasure: {
        select: {
          location: {
            select: { address: true, customer: { select: { name: true } } },
          },
        },
      },
      invoices: { select: { amount: true, status: true } },
    },
  });

  return {
    items: toInvoiceableCandidates(rows).slice(0, limit),
    defaultDepositPct,
  };
}

/**
 * Unscheduled-jobs backlog for the Schedule Manager: approved estimates with
 * no linked `job` event, oldest approval first (longest-waiting on top). The
 * where clause narrows in SQL; {@link toSchedulableCandidates} re-applies the
 * rule in pure code.
 */
export async function listSchedulableEstimates(
  orgId: string,
  limit = 50
): Promise<SchedulableCandidate[]> {
  const rows = await prisma.estimate.findMany({
    where: { orgId, status: "approved", events: { none: { type: "job" } } },
    orderBy: { approvedAt: "asc" },
    take: limit,
    select: {
      id: true,
      estimateNumber: true,
      status: true,
      total: true,
      approvedAt: true,
      siteMeasure: {
        select: {
          location: {
            select: {
              address: true,
              customer: { select: { id: true, name: true } },
            },
          },
        },
      },
      events: { where: { type: "job" }, select: { id: true }, take: 1 },
    },
  });
  return toSchedulableCandidates(rows);
}

export async function listEstimatesForSiteMeasure(
  siteMeasureId: number,
  orgId: string
): Promise<EstimateWithSiteMeasureSummary[]> {
  return prisma.estimate.findMany({
    where: { orgId, siteMeasureId },
    orderBy: { createdAt: "desc" },
    select: ESTIMATE_LIST_SELECT,
  });
}

export async function getEstimate(
  id: number,
  orgId: string
): Promise<EstimateWithDetails | null> {
  return prisma.estimate.findFirst({
    where: { id, orgId },
    select: ESTIMATE_DETAILS_SELECT,
  });
}

/** Server-only load for the send pipeline — see {@link ESTIMATE_SEND_INCLUDE}.
 *  Do not return this value from an API route (it carries `approvalToken`). */
export async function getEstimateForSend(
  id: number,
  orgId: string
): Promise<EstimateForSend | null> {
  return prisma.estimate.findFirst({
    where: { id, orgId },
    include: ESTIMATE_SEND_INCLUDE,
  });
}

export async function createEstimate(
  orgId: string,
  input: { siteMeasureId: number }
): Promise<EstimateWithDetails | null> {
  return prisma.$transaction(async (tx) => {
    const siteMeasure = await tx.siteMeasure.findFirst({
      where: { id: input.siteMeasureId, orgId },
      select: { id: true },
    });
    if (!siteMeasure) return null;

    // Atomically reserve the next number. The increment-returning update locks
    // the Organization row, so concurrent creates can't allocate the same
    // number (a plain findUnique read does not lock under READ COMMITTED).
    const org = await tx.organization.update({
      where: { id: orgId },
      data: { nextEstimateNumber: { increment: 1 } },
      select: {
        nextEstimateNumber: true,
        defaultDepositPct: true,
        defaultTerms: true,
        defaultValidityDays: true,
      },
    });
    const estimateNumber = org.nextEstimateNumber - 1;

    const created = await tx.estimate.create({
      data: {
        orgId,
        siteMeasureId: input.siteMeasureId,
        estimateNumber,
        status: "draft",
        markupPct: 0,
        depositPct: org.defaultDepositPct ?? 0.3,
        terms: org.defaultTerms ?? "",
        validityDays: org.defaultValidityDays ?? 21,
      },
    });

    return tx.estimate.findFirst({
      where: { id: created.id, orgId },
      select: ESTIMATE_DETAILS_SELECT,
    });
  });
}

export async function saveEstimate(
  id: number,
  orgId: string,
  patch: EstimatePatch
): Promise<EstimateWithDetails | null> {
  // Defense in depth: EstimatePatch's type already excludes "approved" /
  // "declined", but this repo function is the trust boundary, so it must not
  // rely solely on the caller's TS types (a route could be re-wired, or the
  // zod schema loosened, without touching this file). Approval/decline must
  // go exclusively through approveEstimateByToken / declineEstimateByToken —
  // those write the EstimateApproval consent row (ip/userAgent/snapshot) and
  // run the supersede-siblings logic that a plain status flip would skip.
  const requestedStatus = patch.status as string | undefined;
  if (
    requestedStatus !== undefined &&
    requestedStatus !== "draft" &&
    requestedStatus !== "sent"
  ) {
    throw new ValidationError(
      `Cannot set estimate status to "${requestedStatus}" directly. Approval and decline must go through the customer-facing token flow.`
    );
  }

  const { lineItems, ...topLevel } = patch;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.estimate.findFirst({
      where: { id, orgId },
      select: { id: true, status: true },
    });
    if (!existing) return null;
    if (isEstimateLocked(existing.status)) {
      throw new EstimateLockedError(existing.status);
    }

    if (Object.keys(topLevel).length > 0) {
      const result = await tx.estimate.updateMany({
        where: { id, orgId },
        data: topLevel,
      });
      if (result.count === 0) return null;
    } else {
      const exists = await tx.estimate.count({ where: { id, orgId } });
      if (exists === 0) return null;
    }

    if (lineItems !== undefined) {
      await tx.lineItem.deleteMany({ where: { estimateId: id } });
      if (lineItems.length > 0) {
        await tx.lineItem.createMany({
          data: lineItems.map(({ id: _id, ...li }) => ({
            ...li,
            estimateId: id,
          })),
        });
      }
    }

    const result = await tx.estimate.findFirst({
      where: { id, orgId },
      select: ESTIMATE_DETAILS_SELECT,
    });
    if (!result) return null;

    // Keep the denormalized Estimate.total in sync with the line items.
    const total = await syncEstimateTotal(tx, id, result);
    return { ...result, total };
  });
}

/**
 * Delete a estimate. Refuses (throws EstimateHasEventsError) when any Event still
 * references it — those are jobs that depend on this estimate per the
 * type=job→estimateId invariant — and (throws HasInvoicesError) when any
 * invoice exists, since Estimate→Invoice→Payment is onDelete: Cascade and the
 * delete would silently erase financial records.
 */
export async function deleteEstimate(
  id: number,
  orgId: string
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await assertDeletable(tx, orgId, { estimateId: id });
    const result = await tx.estimate.deleteMany({ where: { id, orgId } });
    return result.count > 0;
  });
}

/**
 * Generate (or rotate) the public approval token for a estimate.
 * Returns the new token, or null if the estimate isn't found in the org.
 */
export async function rotateApprovalToken(
  id: number,
  orgId: string
): Promise<string | null> {
  const token = generateToken();
  const result = await prisma.estimate.updateMany({
    where: { id, orgId },
    data: { approvalToken: token },
  });
  return result.count > 0 ? token : null;
}

/**
 * Whether the estimate currently has a live approval token — collapsed to a
 * boolean before it ever leaves the server, so the "regenerate link" UI
 * affordance doesn't require exposing `approvalToken` itself. Returns false
 * for an estimate outside the org (matches the null-object pattern other
 * reads use rather than throwing).
 */
export async function estimateHasApprovalToken(
  id: number,
  orgId: string
): Promise<boolean> {
  const row = await prisma.estimate.findFirst({
    where: { id, orgId },
    select: { approvalToken: true },
  });
  return Boolean(row?.approvalToken);
}

/**
 * Clone an approved or declined estimate into a new draft estimate on the
 * same siteMeasure. The new estimate is linked back via `revisedFromId`.
 * Returns null if the source estimate isn't found / not in the org. Throws
 * ConflictError if the source estimate isn't approved or declined — the
 * lifecycle guard lives here (not just in the route) so any caller, not only
 * the HTTP handler, is protected from cloning a draft/sent/viewed estimate.
 */
export async function reviseEstimate(
  estimateId: number,
  orgId: string
): Promise<{ id: number } | null> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.estimate.findFirst({
      where: { id: estimateId, orgId },
      include: { lineItems: true },
    });
    if (!original) return null;
    if (!isEstimateLocked(original.status)) {
      throw new ConflictError(
        "Only approved or declined estimates can be revised"
      );
    }

    const org = await tx.organization.update({
      where: { id: orgId },
      data: { nextEstimateNumber: { increment: 1 } },
      select: { nextEstimateNumber: true },
    });
    const newEstimateNumber = org.nextEstimateNumber - 1;

    const created = await tx.estimate.create({
      data: {
        orgId: original.orgId,
        siteMeasureId: original.siteMeasureId,
        estimateNumber: newEstimateNumber,
        status: "draft",
        date: new Date(),
        markupPct: original.markupPct,
        depositPct: original.depositPct,
        approvalToken: generateToken(),
        revisedFromId: original.id,
      },
      select: { id: true },
    });

    if (original.lineItems.length > 0) {
      await tx.lineItem.createMany({
        data: original.lineItems.map((li) => ({
          estimateId: created.id,
          name: li.name,
          description: li.description,
          unitLabel: li.unitLabel,
          rate: li.rate,
          qtyMode: li.qtyMode,
          qty: li.qty,
          wastePct: li.wastePct,
          linkedRoomIds: li.linkedRoomIds ?? [],
          sortOrder: li.sortOrder,
        })),
      });
    }

    await tx.estimateEvent.create({
      data: {
        estimateId: created.id,
        type: "revised_from",
        source: "builder",
        metadata: {
          revisedFromId: original.id,
          revisedFromEstimateNumber: original.estimateNumber,
        },
      },
    });

    // Seed the denormalized Estimate.total on the cloned draft.
    const hydrated = await tx.estimate.findFirst({
      where: { id: created.id },
      include: {
        lineItems: true,
        siteMeasure: { select: { items: true } },
      },
    });
    if (hydrated) await syncEstimateTotal(tx, created.id, hydrated);

    return { id: created.id };
  });
}

export interface MarkEstimateSentInput {
  to: string;
  subject: string;
  sentByEmail: string;
  sentByName: string;
}

/**
 * Mark a estimate as sent (or resent). Updates Estimate.status/sentAt/etc. and
 * appends a EstimateEvent of type 'sent' (first send) or 'resent' (subsequent).
 * Returns false if the estimate isn't in the org.
 */
export async function markEstimateSent(
  id: number,
  orgId: string,
  input: MarkEstimateSentInput
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.estimate.findFirst({
      where: { id, orgId },
      select: { id: true, status: true, sentAt: true },
    });
    if (!existing) return false;

    await tx.estimate.updateMany({
      where: { id, orgId },
      data: {
        status: isEstimateLocked(existing.status) ? existing.status : "sent",
        sentAt: new Date(),
        sentToEmail: input.to,
        sentByEmail: input.sentByEmail,
        sentByName: input.sentByName,
      },
    });

    await tx.estimateEvent.create({
      data: {
        estimateId: id,
        type: existing.sentAt ? "resent" : "sent",
        source: "builder",
        actorEmail: input.sentByEmail,
        actorName: input.sentByName,
        metadata: { to: input.to, subject: input.subject },
      },
    });

    return true;
  });
}

export interface MarkEstimateViewedInput {
  ip: string | null;
  userAgent: string | null;
}

/**
 * Mark a estimate as viewed by the customer. Idempotent w.r.t. status (only flips
 * sent → viewed) but always appends a EstimateEvent of type 'viewed' so we can
 * count opens. No-op when the estimate is already accepted/declined.
 */
export async function markEstimateViewed(
  estimateId: number,
  orgId: string,
  input: MarkEstimateViewedInput
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const q = await tx.estimate.findFirst({
      where: { id: estimateId, orgId },
      select: { status: true },
    });
    if (!q) return;
    if (isEstimateLocked(q.status)) return;

    if (q.status === "sent") {
      await tx.estimate.updateMany({
        where: { id: estimateId, orgId, status: "sent" },
        data: { status: "viewed", viewedAt: new Date() },
      });
    }

    await tx.estimateEvent.create({
      data: {
        estimateId,
        type: "viewed",
        source: "customer",
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
      },
    });
  });
}

export interface DeclineEstimateInput {
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
}

export type DeclineResult =
  | "ok"
  | "already_approved"
  | "already_declined"
  | "not_found";

/**
 * Decline a estimate (public-token initiated). Atomic: status guard → flip
 * status to "declined" → append a EstimateEvent of type "declined" with the
 * optional reason in metadata.
 */
export async function declineEstimateByToken(
  estimateId: number,
  input: DeclineEstimateInput
): Promise<DeclineResult> {
  return prisma.$transaction(async (tx) => {
    const q = await tx.estimate.findFirst({
      where: { id: estimateId },
      select: { status: true },
    });
    if (!q) return "not_found";
    if (q.status === "approved") return "already_approved";
    if (q.status === "declined") return "already_declined";

    await tx.estimate.updateMany({
      where: { id: estimateId, status: { in: ["draft", "sent", "viewed"] } },
      data: {
        status: "declined",
        declinedAt: new Date(),
        declineReason: input.reason,
      },
    });

    await tx.estimateEvent.create({
      data: {
        estimateId,
        type: "declined",
        source: "customer",
        ip: input.ip ?? undefined,
        userAgent: input.userAgent ?? undefined,
        metadata: input.reason ? { reason: input.reason } : undefined,
      },
    });

    return "ok";
  });
}

/**
 * Look up a estimate by its public approval token (no org scoping — the token
 * itself authorizes access). Returns null on miss.
 */
export async function getEstimateByToken(
  token: string
): Promise<EstimateWithPublicView | null> {
  return prisma.estimate.findUnique({
    where: { approvalToken: token },
    include: ESTIMATE_PUBLIC_INCLUDE,
  });
}
