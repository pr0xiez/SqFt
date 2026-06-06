import { fetchAddressSuggestions } from "@/lib/address/geoapify";
import { apiRoute } from "@/lib/api/route";

// Server proxy so GEOAPIFY_API_KEY stays server-side and the provider stays
// swappable. Returns [] (never errors) when the key is unset or upstream fails.
export const GET = apiRoute({ minRole: "lead" }, async ({ req }) => {
  const query = req.nextUrl.searchParams.get("q") ?? "";
  return fetchAddressSuggestions(query);
});
