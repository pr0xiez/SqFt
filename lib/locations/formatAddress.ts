export interface AddressParts {
  street: string;
  unit?: string | null;
  city: string;
  state: string;
  postalCode: string;
}

/**
 * Compose a one-line US address from structured parts. This is the value
 * stored in the derived `Location.address` column that all list views and
 * estimate/invoice snapshots read. Empty parts are skipped; `state` and
 * `postalCode` join with a space (e.g. "OH 43215"), everything else with ", ".
 */
export function formatAddress(parts: AddressParts): string {
  const street = parts.street.trim();
  const unit = (parts.unit ?? "").trim();
  const city = parts.city.trim();
  const state = parts.state.trim();
  const postalCode = parts.postalCode.trim();

  const stateZip = [state, postalCode].filter(Boolean).join(" ");
  return [street, unit, city, stateZip].filter(Boolean).join(", ");
}

export interface LocationAddressInput extends AddressParts {
  lat?: number | null;
  lon?: number | null;
}

/**
 * Build the `Location` address columns from structured parts — the SINGLE
 * source of the "`address` always equals `formatAddress(parts)`" invariant.
 * Every write path (repo create, seed) must spread this so the derived
 * `address` column can never desync from the structured fields it summarizes.
 * Returns only the address-related columns; callers add orgId/customerId/
 * label/notes around it.
 */
export function locationAddressColumns(parts: LocationAddressInput) {
  return {
    address: formatAddress(parts),
    street: parts.street,
    unit: parts.unit ?? null,
    city: parts.city,
    state: parts.state,
    postalCode: parts.postalCode,
    lat: parts.lat ?? null,
    lon: parts.lon ?? null,
  };
}
