import { hasMinRole, type Role } from "@/lib/auth/permissions";

export type IconId =
  | "dashboard"
  | "customers"
  | "siteMeasures"
  | "estimates"
  | "myschedule"
  | "scheduleManager"
  | "settings"
  | "more";

export interface NavItem {
  href: string;
  label: string;
  icon: IconId;
  /** Minimum role that may see this destination. */
  minRole: Role;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/** Grouped destinations — the single source of truth for sidebar + drawer. */
const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: "dashboard", minRole: "lead" },
    ],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    items: [
      {
        href: "/customers",
        label: "Customers",
        icon: "customers",
        minRole: "lead",
      },
      {
        href: "/site-measures",
        label: "Site Measures",
        icon: "siteMeasures",
        minRole: "lead",
      },
      {
        href: "/estimates",
        label: "Estimates",
        icon: "estimates",
        minRole: "lead",
      },
    ],
  },
  {
    id: "schedule",
    label: "Schedule",
    items: [
      {
        href: "/my-schedule",
        label: "My Schedule",
        icon: "myschedule",
        minRole: "crew",
      },
      {
        href: "/schedule",
        label: "Schedule Manager",
        icon: "scheduleManager",
        minRole: "lead",
      },
    ],
  },
];

/** Footer destination, rendered below the groups in both sidebar and drawer. */
export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: "settings",
  minRole: "lead",
};

/**
 * Ordered shortcuts shown on the mobile bottom bar (lead+ only — crew gets no
 * bottom bar). Labels intentionally differ from the sidebar (Home, Schedule).
 */
export const BOTTOM_BAR_SHORTCUTS: ReadonlyArray<{
  href: string;
  label: string;
  icon: IconId;
}> = [
  { href: "/", label: "Home", icon: "dashboard" },
  { href: "/customers", label: "Customers", icon: "customers" },
  { href: "/estimates", label: "Estimates", icon: "estimates" },
  { href: "/my-schedule", label: "Schedule", icon: "myschedule" },
];

/** Groups visible to a role, with role-hidden items and emptied groups removed. */
export function navGroupsFor(role: string): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => hasMinRole(role, i.minRole)),
  })).filter((g) => g.items.length > 0);
}

/** Whether the Settings footer item is visible to a role. */
export function canSeeSettings(role: string): boolean {
  return hasMinRole(role, SETTINGS_ITEM.minRole);
}

/** A destination is active on its exact root or any sub-route prefix. */
export function isItemActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** The More cell is active whenever no bottom-bar shortcut owns the route. */
export function isMoreActive(pathname: string): boolean {
  return !BOTTOM_BAR_SHORTCUTS.some((s) => isItemActive(s.href, pathname));
}
