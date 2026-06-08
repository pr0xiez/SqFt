export const ROLE_RANK = { crew: 0, lead: 1, admin: 2 } as const;
export type Role = keyof typeof ROLE_RANK;

export function hasMinRole(role: string, min: Role): boolean {
  const r = ROLE_RANK[role as Role];
  return r !== undefined && r >= ROLE_RANK[min];
}

export function homePathFor(role: string): string {
  return role === "crew" ? "/my-schedule" : "/";
}
