export type EstimateStatus = "all" | "empty" | "measured" | "quoted";

export type EstimateFilterInput = {
  id: number;
  customer?: { name: string } | null;
  items?: { type: string }[];
  quotes?: unknown[];
};

export function filterEstimates<T extends EstimateFilterInput>(
  estimates: T[],
  query: string,
  status: EstimateStatus
): T[] {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  return estimates.filter((e) => {
    if (status !== "all") {
      const roomCount = (e.items ?? []).filter((i) => i.type === "room").length;
      const quoteCount = e.quotes?.length ?? 0;
      if (status === "empty" && roomCount > 0) return false;
      if (status === "measured" && (roomCount === 0 || quoteCount > 0))
        return false;
      if (status === "quoted" && quoteCount === 0) return false;
    }
    if (q.length > 0) {
      const idMatch = String(e.id).includes(q);
      const nameMatch = (e.customer?.name ?? "").toLowerCase().includes(q);
      if (!idMatch && !nameMatch) return false;
    }
    return true;
  });
}
