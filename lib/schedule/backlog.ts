/**
 * Unscheduled-jobs backlog: approved estimates that no `job` Event has been
 * scheduled for yet. Pure projection decoupled from Prisma (mirroring
 * lib/quickCreate/candidates.ts) so the qualifying rule is unit-testable.
 */

/** Minimal structural shape of an estimate row needed to decide backlog membership. */
export interface SchedulableEstimateRow {
  id: number;
  estimateNumber: number;
  status: string;
  /** Denormalized estimate total (null until the estimate has priced lines). */
  total: number | null;
  approvedAt: Date | string | null;
  siteMeasure: {
    location: {
      address: string | null;
      customer: { id: number; name: string } | null;
    } | null;
  } | null;
  /** The estimate's linked job events; any element disqualifies the row. */
  events: Array<{ id: number }>;
}

/** An approved-but-unscheduled estimate surfaced in the schedule backlog. */
export interface SchedulableCandidate {
  id: number;
  estimateNumber: number;
  customerId: number | null;
  customerName: string;
  address: string | null;
  total: number | null;
  /** ISO timestamp; drives the "waiting N days" label and FIFO ordering. */
  approvedAt: string | null;
}

/**
 * Project estimate rows to backlog candidates, keeping only approved
 * estimates with no linked job event. The repo query narrows in SQL for
 * efficiency; the rule is re-applied here so it stays testable and holds even
 * if a caller passes broader rows.
 */
export function toSchedulableCandidates(
  rows: SchedulableEstimateRow[]
): SchedulableCandidate[] {
  const candidates: SchedulableCandidate[] = [];
  for (const e of rows) {
    if (e.status !== "approved" || e.events.length > 0) continue;
    candidates.push({
      id: e.id,
      estimateNumber: e.estimateNumber,
      customerId: e.siteMeasure?.location?.customer?.id ?? null,
      customerName: e.siteMeasure?.location?.customer?.name ?? "—",
      address: e.siteMeasure?.location?.address ?? null,
      total: e.total,
      approvedAt: e.approvedAt ? new Date(e.approvedAt).toISOString() : null,
    });
  }
  return candidates;
}
