/**
 * Convert an org display name to a URL-safe kebab-case slug.
 *
 * Rules:
 *  - lowercase
 *  - non-alphanumeric ASCII becomes a dash
 *  - multiple dashes collapse to one
 *  - leading/trailing dashes stripped
 *  - max 60 chars
 *  - empty result falls back to "org"
 */
export function kebabSlug(name: string): string {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const trimmed = ascii.replace(/^-+|-+$/g, "");
  const truncated = trimmed.slice(0, 60).replace(/-+$/g, "");
  return truncated.length > 0 ? truncated : "org";
}
