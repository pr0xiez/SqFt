export function getInitials(
  name?: string | null,
  email?: string | null
): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    const out = (first + last).toUpperCase();
    if (out) return out;
  }
  if (email?.trim()) {
    return email.trim()[0]?.toUpperCase() ?? "·";
  }
  return "··";
}
