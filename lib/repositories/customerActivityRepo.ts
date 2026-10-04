import type { CustomerActivity } from "@/lib/customers/activity";
import { prisma } from "@/lib/prisma";

/** Estimate events that read as history; `link_rotated` is bookkeeping. */
const TIMELINE_ESTIMATE_EVENTS = [
  "sent",
  "resent",
  "viewed",
  "approved",
  "declined",
  "revised_from",
];

/** Invoice events that read as history. Payments come from the Payment
 *  ledger itself, so `payment_recorded` would only duplicate them. */
const TIMELINE_INVOICE_EVENTS = [
  "sent",
  "resent",
  "viewed",
  "voided",
  "payment_failed",
];

function metaString(meta: unknown, key: string): string | null {
  if (meta === null || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function metaNumber(meta: unknown, key: string): number | null {
  if (meta === null || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * Everything that has happened across one customer's record chain (site
 * measures, estimates and their events, invoices with payments and events)
 * plus every schedule event tied to them, either directly (`customerId`) or
 * through one of their estimates. Returns null when the customer isn't in
 * `orgId`. The pure projections in `lib/customers/activity.ts` turn this into
 * the hub's money summary, upcoming list and timeline.
 */
export async function getCustomerActivity(
  orgId: string,
  customerId: number
): Promise<CustomerActivity | null> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, orgId },
    select: {
      createdAt: true,
      locations: {
        select: {
          address: true,
          siteMeasures: {
            select: {
              id: true,
              siteMeasureNumber: true,
              createdAt: true,
              estimates: {
                select: {
                  id: true,
                  estimateNumber: true,
                  status: true,
                  total: true,
                  createdAt: true,
                  estimateEvents: {
                    where: { type: { in: TIMELINE_ESTIMATE_EVENTS } },
                    orderBy: { createdAt: "asc" },
                    select: {
                      id: true,
                      type: true,
                      source: true,
                      metadata: true,
                      createdAt: true,
                    },
                  },
                  invoices: {
                    select: {
                      id: true,
                      invoiceNumber: true,
                      status: true,
                      amount: true,
                      dueDate: true,
                      createdAt: true,
                      payments: {
                        orderBy: { paidAt: "asc" },
                        select: {
                          id: true,
                          amount: true,
                          method: true,
                          paidAt: true,
                        },
                      },
                      invoiceEvents: {
                        where: { type: { in: TIMELINE_INVOICE_EVENTS } },
                        orderBy: { createdAt: "asc" },
                        select: {
                          id: true,
                          type: true,
                          metadata: true,
                          createdAt: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!customer) return null;

  const events = await prisma.event.findMany({
    where: {
      orgId,
      OR: [
        { customerId },
        { estimate: { siteMeasure: { location: { customerId } } } },
      ],
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    select: {
      id: true,
      type: true,
      title: true,
      date: true,
      endDate: true,
      startTime: true,
      endTime: true,
      estimateId: true,
      estimate: { select: { estimateNumber: true } },
      assignees: {
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
    },
  });

  const activity: CustomerActivity = {
    customerCreatedAt: iso(customer.createdAt),
    siteMeasures: [],
    estimates: [],
    invoices: [],
    events: events.map((ev) => ({
      id: ev.id,
      type: ev.type,
      title: ev.title,
      date: iso(ev.date),
      endDate: isoOrNull(ev.endDate),
      startTime: ev.startTime,
      endTime: ev.endTime,
      estimateId: ev.estimateId,
      estimateNumber: ev.estimate?.estimateNumber ?? null,
      assignees: ev.assignees,
    })),
  };

  for (const loc of customer.locations) {
    for (const sm of loc.siteMeasures) {
      activity.siteMeasures.push({
        id: sm.id,
        siteMeasureNumber: sm.siteMeasureNumber,
        createdAt: iso(sm.createdAt),
        address: loc.address,
      });
      for (const est of sm.estimates) {
        activity.estimates.push({
          id: est.id,
          estimateNumber: est.estimateNumber,
          siteMeasureId: sm.id,
          status: est.status,
          total: est.total,
          createdAt: iso(est.createdAt),
          events: est.estimateEvents.map((ev) => ({
            id: ev.id,
            type: ev.type,
            source: ev.source,
            createdAt: iso(ev.createdAt),
            to: metaString(ev.metadata, "to"),
            reason: metaString(ev.metadata, "reason"),
            relatedEstimateNumber:
              metaNumber(ev.metadata, "revisedFromEstimateNumber") ??
              metaNumber(ev.metadata, "supersededByEstimateNumber"),
          })),
        });
        for (const inv of est.invoices) {
          activity.invoices.push({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            estimateId: est.id,
            estimateNumber: est.estimateNumber,
            status: inv.status,
            amount: inv.amount,
            dueDate: isoOrNull(inv.dueDate),
            createdAt: iso(inv.createdAt),
            payments: inv.payments.map((p) => ({
              id: p.id,
              amount: p.amount,
              method: p.method,
              paidAt: iso(p.paidAt),
            })),
            events: inv.invoiceEvents.map((ev) => ({
              id: ev.id,
              type: ev.type,
              createdAt: iso(ev.createdAt),
              to: metaString(ev.metadata, "to"),
            })),
          });
        }
      }
    }
  }

  activity.invoices.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return activity;
}
