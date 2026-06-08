export interface EventLocationSource {
  estimate?: {
    estimateNumber: number;
    siteMeasure?: { location?: { address: string | null } | null } | null;
  } | null;
  customer?: {
    id: number;
    name: string;
    phone: string | null;
    locations?: { address: string | null }[];
  } | null;
}

/** First non-blank of: estimate's site-measure location, then customer's first location. */
export function resolveEventAddress(e: EventLocationSource): string | null {
  const fromEstimate = e.estimate?.siteMeasure?.location?.address?.trim();
  if (fromEstimate) return fromEstimate;
  const fromCustomer = e.customer?.locations?.[0]?.address?.trim();
  if (fromCustomer) return fromCustomer;
  return null;
}
