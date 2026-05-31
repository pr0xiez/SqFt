export type SiteMeasureStatus = "all" | "empty" | "measured" | "estimated";

export type SiteMeasureFilterInput = {
  id: number;
  location?: { customer?: { name: string } | null } | null;
  items?: { type: string }[];
  estimates?: unknown[];
};

export function filterSiteMeasures<T extends SiteMeasureFilterInput>(
  siteMeasures: T[],
  query: string,
  status: SiteMeasureStatus
): T[] {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  return siteMeasures.filter((e) => {
    if (status !== "all") {
      const roomCount = (e.items ?? []).filter((i) => i.type === "room").length;
      const estimateCount = e.estimates?.length ?? 0;
      if (status === "empty" && roomCount > 0) return false;
      if (status === "measured" && (roomCount === 0 || estimateCount > 0))
        return false;
      if (status === "estimated" && estimateCount === 0) return false;
    }
    if (q.length > 0) {
      const idMatch = String(e.id).includes(q);
      const nameMatch = (e.location?.customer?.name ?? "")
        .toLowerCase()
        .includes(q);
      if (!idMatch && !nameMatch) return false;
    }
    return true;
  });
}
