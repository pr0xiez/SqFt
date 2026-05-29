export type EstimateStatusFilter =
  | "all"
  | "draft"
  | "sent"
  | "approved"
  | "declined";

export type EstimateFilterInput = {
  id: number;
  estimateNumber: number;
  status: string;
  siteMeasure: {
    id: number;
    siteMeasureNumber?: number | null;
    location?: { customer?: { name: string } | null } | null | undefined;
  };
};

export function filterEstimates<T extends EstimateFilterInput>(
  estimates: T[],
  query: string,
  status: EstimateStatusFilter
): T[] {
  const cleaned = query.trim().toLowerCase().replace(/^#/, "");
  return estimates.filter((q) => {
    if (status !== "all" && q.status !== status) return false;
    if (cleaned.length === 0) return true;

    const estimateNumStr = String(q.estimateNumber);
    if (estimateNumStr.includes(cleaned)) return true;

    const estimateLabel = String(
      q.siteMeasure.siteMeasureNumber ?? q.siteMeasure.id
    );
    if (estimateLabel.includes(cleaned)) return true;

    const customerName = q.siteMeasure.location?.customer?.name ?? "";
    if (customerName.toLowerCase().includes(cleaned)) return true;

    return false;
  });
}
