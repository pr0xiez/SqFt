export type QuoteStatusFilter =
  | "all"
  | "draft"
  | "sent"
  | "accepted"
  | "declined";

export type QuoteFilterInput = {
  id: number;
  quoteNumber: number;
  status: string;
  estimate: {
    id: number;
    estimateNumber?: number | null;
    customer?: { name: string } | null | undefined;
  };
};

export function filterQuotes<T extends QuoteFilterInput>(
  quotes: T[],
  query: string,
  status: QuoteStatusFilter
): T[] {
  const cleaned = query.trim().toLowerCase().replace(/^#/, "");
  return quotes.filter((q) => {
    if (status !== "all" && q.status !== status) return false;
    if (cleaned.length === 0) return true;

    const quoteNumStr = String(q.quoteNumber);
    if (quoteNumStr.includes(cleaned)) return true;

    const estimateLabel = String(q.estimate.estimateNumber ?? q.estimate.id);
    if (estimateLabel.includes(cleaned)) return true;

    const customerName = q.estimate.customer?.name ?? "";
    if (customerName.toLowerCase().includes(cleaned)) return true;

    return false;
  });
}
