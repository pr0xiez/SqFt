/**
 * Simple className merger utility.
 * Filters out falsy values and joins with a space.
 * For production, swap this for `clsx` + `tailwind-merge` if needed.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
