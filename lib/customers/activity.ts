/**
 * Customer activity: everything that has happened (or is booked) across one
 * customer's record chain, normalized by `getCustomerActivity`
 * (`lib/repositories/customerActivityRepo.ts`) and served by
 * `GET /api/customers/[id]/activity`. The projections below are pure and
 * client-safe; the customer hub (`components/customers/CustomerDetail`) runs
 * them with the browser's local "today", so upcoming vs past is decided in the
 * user's time zone rather than the server's.
 */

import {
  invoiceOutstanding,
  isInvoiceOverdue,
  paymentsPaidTotal,
} from "@/lib/invoices";
import { OPEN_INVOICE_STATUSES } from "@/lib/invoices/statusFilter";
import { round2 } from "@/lib/money";

export interface ActivitySiteMeasure {
  id: number;
  siteMeasureNumber: number | null;
  createdAt: string;
  address: string;
}

export interface ActivityEstimateEvent {
  id: number;
  type: string;
  source: string | null;
  createdAt: string;
  /** Recipient of a send/resend. */
  to: string | null;
  /** Customer's decline reason. */
  reason: string | null;
  /** Revision source (`revised_from`) or the approved sibling that
   *  auto-declined this estimate (`declined` from `system_supersede`). */
  relatedEstimateNumber: number | null;
}

export interface ActivityEstimate {
  id: number;
  estimateNumber: number;
  siteMeasureId: number;
  status: string;
  total: number | null;
  createdAt: string;
  events: ActivityEstimateEvent[];
}

export interface ActivityInvoiceEvent {
  id: number;
  type: string;
  createdAt: string;
  to: string | null;
}

export interface ActivityPayment {
  id: number;
  amount: number;
  method: string;
  paidAt: string;
}

export interface ActivityInvoice {
  id: number;
  invoiceNumber: number;
  estimateId: number;
  estimateNumber: number;
  status: string;
  amount: number;
  dueDate: string | null;
  createdAt: string;
  payments: ActivityPayment[];
  events: ActivityInvoiceEvent[];
}

export interface ActivityScheduleEvent {
  id: number;
  type: string;
  title: string;
  date: string;
  endDate: string | null;
  startTime: string;
  endTime: string;
  estimateId: number | null;
  estimateNumber: number | null;
  assignees: { id: string; name: string }[];
}

export interface CustomerActivity {
  customerCreatedAt: string;
  siteMeasures: ActivitySiteMeasure[];
  estimates: ActivityEstimate[];
  /** Newest first. */
  invoices: ActivityInvoice[];
  /** Soonest first. */
  events: ActivityScheduleEvent[];
}

// ── Money summary ─────────────────────────────────────────────────────────

export interface CustomerMoneySummary {
  /** Estimates out with the customer (sent or viewed). */
  openCount: number;
  openValue: number;
  approvedCount: number;
  approvedValue: number;
  declinedCount: number;
  /** Non-void invoices. */
  invoiced: number;
  paid: number;
  /** What the customer owes right now: the live balance on invoices that
   *  have been sent and aren't paid (drafts aren't owed yet). */
  balanceDue: number;
  overdueCount: number;
}

const OPEN_INVOICE_SET = new Set<string>(OPEN_INVOICE_STATUSES);

/** Money and pipeline figures for the hub's stat strip. Takes any estimate
 *  list with status + total (the customer payload's or the activity feed's). */
export function summarizeCustomerActivity(activity: {
  estimates: ReadonlyArray<{ status: string; total: number | null }>;
  invoices: ReadonlyArray<
    Pick<ActivityInvoice, "status" | "amount" | "dueDate" | "payments">
  >;
}): CustomerMoneySummary {
  let openCount = 0;
  let openValue = 0;
  let approvedCount = 0;
  let approvedValue = 0;
  let declinedCount = 0;
  for (const e of activity.estimates) {
    if (e.status === "sent" || e.status === "viewed") {
      openCount++;
      openValue += e.total ?? 0;
    } else if (e.status === "approved") {
      approvedCount++;
      approvedValue += e.total ?? 0;
    } else if (e.status === "declined") {
      declinedCount++;
    }
  }

  let invoiced = 0;
  let paid = 0;
  let balanceDue = 0;
  let overdueCount = 0;
  for (const inv of activity.invoices) {
    if (inv.status === "void") continue;
    invoiced += inv.amount;
    paid += paymentsPaidTotal(inv.payments);
    if (OPEN_INVOICE_SET.has(inv.status)) {
      balanceDue += Math.max(0, invoiceOutstanding(inv));
      if (isInvoiceOverdue(inv)) overdueCount++;
    }
  }

  return {
    openCount,
    openValue: round2(openValue),
    approvedCount,
    approvedValue: round2(approvedValue),
    declinedCount,
    invoiced: round2(invoiced),
    paid: round2(paid),
    balanceDue: round2(balanceDue),
    overdueCount,
  };
}

// ── Schedule ──────────────────────────────────────────────────────────────

/** Last calendar day (YYYY-MM-DD) an event occupies. */
function lastDayOf(ev: Pick<ActivityScheduleEvent, "date" | "endDate">) {
  return (ev.endDate ?? ev.date).slice(0, 10);
}

/** Events still ahead of (or running on) `today`, soonest first. */
export function upcomingEvents(
  events: ActivityScheduleEvent[],
  today: string
): ActivityScheduleEvent[] {
  return events
    .filter((ev) => lastDayOf(ev) >= today)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
    );
}

// ── Timeline ──────────────────────────────────────────────────────────────

export type TimelineTone = "default" | "ok" | "warn" | "bad";

/** What kind of moment an entry is, for its icon. */
export type TimelineKind =
  | "customer"
  | "siteMeasure"
  | "drafted"
  | "sent"
  | "viewed"
  | "approved"
  | "declined"
  | "closed"
  | "invoice"
  | "voided"
  | "paymentFailed"
  | "payment"
  | "event";

export interface TimelineEntry {
  /** Stable, unique React key. */
  id: string;
  kind: TimelineKind;
  /** When it happened: an ISO timestamp, or `YYYY-MM-DDTHH:mm` (local) for
   *  schedule events. */
  at: string;
  title: string;
  detail: string | null;
  href: string | null;
  /** Money involved, formatted by the view. */
  amount: number | null;
  tone: TimelineTone;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  job: "Job",
  visit: "Visit",
  other: "Event",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  check: "Check",
  cash: "Cash",
  card: "Card",
  ach: "ACH",
  stripe: "Online payment",
  other: "Other",
};

function viewDetail(count: number): string | null {
  return count > 1 ? `Opened ${count} times` : null;
}

function atMs(at: string): number {
  const ms = new Date(at).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** Builds an entry with the common defaults (no detail/href/amount, neutral
 *  tone) so each builder only spells out what differs. */
function entry(
  e: Pick<TimelineEntry, "id" | "kind" | "at" | "title"> &
    Partial<TimelineEntry>
): TimelineEntry {
  return {
    detail: null,
    href: null,
    amount: null,
    tone: "default",
    ...e,
  };
}

/** Where a document's events land: key prefix, display label and link. */
interface EventContext {
  prefix: "est" | "inv";
  label: string;
  href: string;
}

function eventBase(
  ctx: EventContext,
  ev: { id: number; createdAt: string }
): Pick<TimelineEntry, "id" | "at" | "href"> {
  return { id: `${ctx.prefix}-ev-${ev.id}`, at: ev.createdAt, href: ctx.href };
}

/** `sent`/`resent`/`viewed` read the same for estimates and invoices. Repeat
 *  opens collapse into the first view (`views` is every `viewed` event). */
function sharedEventEntry(
  ctx: EventContext,
  ev: { id: number; type: string; createdAt: string; to: string | null },
  views: ReadonlyArray<unknown>
): TimelineEntry | null {
  const base = eventBase(ctx, ev);
  switch (ev.type) {
    case "sent":
    case "resent":
      return entry({
        ...base,
        kind: "sent",
        title: `${ctx.label} ${ev.type}`,
        detail: ev.to ? `To ${ev.to}` : null,
      });
    case "viewed":
      if (ev !== views[0]) return null;
      return entry({
        ...base,
        kind: "viewed",
        title: `${ctx.label} viewed`,
        detail: viewDetail(views.length),
        tone: "warn",
      });
    default:
      return null;
  }
}

function siteMeasureEntry(sm: ActivitySiteMeasure): TimelineEntry {
  return entry({
    id: `sm-${sm.id}`,
    kind: "siteMeasure",
    at: sm.createdAt,
    title: `Site measure #${sm.siteMeasureNumber ?? sm.id} started`,
    detail: sm.address || null,
    href: `/site-measures/${sm.id}`,
  });
}

/** Estimate-only milestones: approved, declined / auto-closed. */
function estimateOnlyEventEntry(
  ctx: EventContext,
  est: ActivityEstimate,
  ev: ActivityEstimateEvent
): TimelineEntry | null {
  const base = eventBase(ctx, ev);
  switch (ev.type) {
    case "approved":
      return entry({
        ...base,
        kind: "approved",
        title: `${ctx.label} approved`,
        amount: est.total,
        tone: "ok",
      });
    case "declined":
      if (ev.source === "system_supersede") {
        return entry({
          ...base,
          kind: "closed",
          title: `${ctx.label} closed`,
          detail: ev.relatedEstimateNumber
            ? `Estimate #${ev.relatedEstimateNumber} was approved instead`
            : "Another estimate was approved instead",
        });
      }
      return entry({
        ...base,
        kind: "declined",
        title: `${ctx.label} declined`,
        detail: ev.reason ? `"${ev.reason}"` : null,
        tone: "bad",
      });
    default:
      return null;
  }
}

/** Invoice-only milestones: voided, payment failed. */
function invoiceOnlyEventEntry(
  ctx: EventContext,
  inv: ActivityInvoice,
  ev: ActivityInvoiceEvent
): TimelineEntry | null {
  const base = eventBase(ctx, ev);
  switch (ev.type) {
    case "voided":
      return entry({
        ...base,
        kind: "voided",
        title: `${ctx.label} voided`,
        tone: "bad",
      });
    case "payment_failed":
      return entry({
        ...base,
        kind: "paymentFailed",
        title: `Payment failed on invoice #${inv.invoiceNumber}`,
        tone: "bad",
      });
    default:
      return null;
  }
}

function estimateEntries(est: ActivityEstimate): TimelineEntry[] {
  const ctx: EventContext = {
    prefix: "est",
    label: `Estimate #${est.estimateNumber}`,
    href: `/estimates/${est.id}`,
  };
  const revision = est.events.find((e) => e.type === "revised_from");
  const views = est.events.filter((e) => e.type === "viewed");
  const entries = [
    entry({
      id: `est-${est.id}`,
      kind: "drafted",
      at: est.createdAt,
      title: `${ctx.label} drafted`,
      detail: revision?.relatedEstimateNumber
        ? `Revision of estimate #${revision.relatedEstimateNumber}`
        : null,
      href: ctx.href,
    }),
  ];
  for (const ev of est.events) {
    const e =
      sharedEventEntry(ctx, ev, views) ?? estimateOnlyEventEntry(ctx, est, ev);
    if (e) entries.push(e);
  }
  return entries;
}

function invoiceEntries(inv: ActivityInvoice): TimelineEntry[] {
  const ctx: EventContext = {
    prefix: "inv",
    label: `Invoice #${inv.invoiceNumber}`,
    href: `/invoices/${inv.id}`,
  };
  const views = inv.events.filter((e) => e.type === "viewed");
  const entries = [
    entry({
      id: `inv-${inv.id}`,
      kind: "invoice",
      at: inv.createdAt,
      title: `${ctx.label} drafted`,
      detail: `For estimate #${inv.estimateNumber}`,
      href: ctx.href,
      amount: inv.amount,
    }),
  ];
  for (const ev of inv.events) {
    const e =
      sharedEventEntry(ctx, ev, views) ?? invoiceOnlyEventEntry(ctx, inv, ev);
    if (e) entries.push(e);
  }
  for (const p of inv.payments) {
    entries.push(
      entry({
        id: `pay-${p.id}`,
        kind: "payment",
        at: p.paidAt,
        title: "Payment received",
        detail: `${PAYMENT_METHOD_LABELS[p.method] ?? p.method}, invoice #${inv.invoiceNumber}`,
        href: ctx.href,
        amount: p.amount,
        tone: "ok",
      })
    );
  }
  return entries;
}

function scheduleEventEntry(ev: ActivityScheduleEvent): TimelineEntry {
  const day = ev.date.slice(0, 10);
  const crew = ev.assignees.map((a) => a.name).join(", ");
  return entry({
    id: `event-${ev.id}`,
    kind: "event",
    at: `${day}T${ev.startTime}`,
    title: ev.title,
    detail: [EVENT_TYPE_LABELS[ev.type] ?? "Event", crew]
      .filter(Boolean)
      .join(", "),
    href: `/schedule?date=${day}`,
  });
}

/**
 * The customer's history, newest first: intake, site measures, every estimate
 * and invoice milestone, payments, and schedule events whose last day is
 * before `today` (later ones belong in `upcomingEvents`). Repeat opens of the
 * same document collapse into its first view.
 */
export function buildCustomerTimeline(
  activity: CustomerActivity,
  today: string
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    entry({
      id: "customer",
      kind: "customer",
      at: activity.customerCreatedAt,
      title: "Customer added",
    }),
    ...activity.siteMeasures.map(siteMeasureEntry),
    ...activity.estimates.flatMap(estimateEntries),
    ...activity.invoices.flatMap(invoiceEntries),
    ...activity.events
      .filter((ev) => lastDayOf(ev) < today)
      .map(scheduleEventEntry),
  ];
  return entries.sort((a, b) => atMs(b.at) - atMs(a.at));
}
