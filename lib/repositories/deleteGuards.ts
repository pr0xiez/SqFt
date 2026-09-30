import type { Prisma } from "@/app/generated/prisma/client";
import { EstimateHasEventsError, HasInvoicesError } from "@/lib/api/errors";

/**
 * Scopes an Event/Invoice count to "estimates that descend from the record
 * being deleted" — either a direct `estimateId` filter (deleting an estimate
 * itself) or a nested `estimate` relation filter (deleting a site measure or
 * customer, which reach the estimate through one or more relations). Event
 * and Invoice both expose these same two filter shapes, since both are
 * related to Estimate the same way.
 */
export type DescendantEstimateScope =
  | { estimateId: number }
  | { estimate: Prisma.EstimateWhereInput };

/**
 * Shared cascade-delete guard for the Customer→Location→SiteMeasure→Estimate
 * chain. Every delete path that can cascade away a descendant Estimate must
 * refuse (throw `EstimateHasEventsError`) while any Event still references
 * one of those estimates — those are jobs that depend on the
 * type=job→estimateId invariant — and refuse (throw `HasInvoicesError`) while
 * any Invoice exists for one of those estimates, since Estimate→Invoice→
 * Payment is `onDelete: Cascade` and the delete would silently erase
 * financial records.
 *
 * `estimateScope` supplies just the relation path needed to reach the
 * descendant estimate(s) — `{ estimateId: id }` when deleting an estimate
 * itself, `{ estimate: { siteMeasureId: id } }` when deleting a site
 * measure, or a deeper relation path (e.g.
 * `{ estimate: { siteMeasure: { location: { customerId: id } } } }`) when
 * deleting a customer. `orgId` is applied directly on the Event/Invoice
 * count. An optional `eventScope` also protects direct customer-linked events
 * in addition to descendant jobs. Org scoping is enforced here
 * (not just transitively via the estimate relation), preserving the
 * same org-isolation guarantee each call site enforced before this was
 * extracted.
 */
export async function assertDeletable(
  tx: Prisma.TransactionClient,
  orgId: string,
  estimateScope: DescendantEstimateScope,
  eventScope: Prisma.EventWhereInput = estimateScope
): Promise<void> {
  const eventCount = await tx.event.count({
    where: { ...eventScope, orgId },
  });
  if (eventCount > 0) throw new EstimateHasEventsError(eventCount);

  const invoiceCount = await tx.invoice.count({
    where: { orgId, ...estimateScope },
  });
  if (invoiceCount > 0) throw new HasInvoicesError(invoiceCount);
}
