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
