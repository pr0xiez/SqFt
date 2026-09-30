import { getEnv } from "@/lib/env";

export interface AddressSuggestion {
  formatted: string;
  street: string;
  unit: string;
  city: string;
  state: string;
  postalCode: string;
  lat: number | null;
  lon: number | null;
}

interface GeoapifyResult {
  housenumber?: string;
  street?: string;
  city?: string;
  state?: string;
  state_code?: string;
  postcode?: string;
  lat?: number;
  lon?: number;
  formatted?: string;
}

/** Map Geoapify's `format=json` results into our normalized suggestion shape. */
export function mapGeoapifyResults(json: unknown): AddressSuggestion[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results.map((raw): AddressSuggestion => {
    const r = raw as GeoapifyResult;
    const street = [r.housenumber, r.street].filter(Boolean).join(" ").trim();
    return {
      formatted: r.formatted ?? "",
      street,
      unit: "",
      city: r.city ?? "",
      state: r.state_code ?? r.state ?? "",
      postalCode: r.postcode ?? "",
      lat: typeof r.lat === "number" ? r.lat : null,
      lon: typeof r.lon === "number" ? r.lon : null,
    };
  });
}

/**
 * Fetch autocomplete suggestions from Geoapify. Returns [] when no API key is
 * configured or the upstream call fails — callers treat that as "no
 * suggestions" so the manual fields keep working (graceful degradation).
 */
export async function fetchAddressSuggestions(
  query: string
): Promise<AddressSuggestion[]> {
  const apiKey = getEnv().GEOAPIFY_API_KEY;
  if (!apiKey || query.trim().length < 3) return [];

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("filter", "countrycode:us");
  url.searchParams.set("limit", "5");
  url.searchParams.set("apiKey", apiKey);

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return [];
    return mapGeoapifyResults(await res.json());
  } catch {
    return [];
  }
}
