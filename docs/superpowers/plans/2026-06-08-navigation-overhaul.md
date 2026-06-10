# Navigation Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cramped 7-cell mobile bottom bar and the desktop text top-bar with one nav model — a persistent collapsible left sidebar on desktop and a fixed 4-shortcut bottom bar + slide-in drawer on mobile — all driven by a single shared nav config.

**Architecture:** A pure config module (`lib/nav/items.ts`) is the single source of truth for destinations, grouping, role-gating, the mobile bottom-bar shortcut set, and active-state logic. Presentation components (`SideNav`, `NavDrawer`, `MobileTabBar`, shared `NavMenu` + `AccountBlock`) consume that config. `AppNav` is a thin orchestrator that picks the surface by breakpoint and role. This is **chrome only** — the sole content-adjacent edit is `app/(app)/layout.tsx`, which flips from a column to a sidebar+main row.

**Tech Stack:** Next.js (app router, client components), React, Tailwind utility classes + theme CSS vars (`var(--accent)`, `var(--surface)`, `var(--line)`, `var(--muted)`, `var(--ink)`, `var(--font-mono)`, `var(--shadow-md)`), `next-auth/react` (`useSession`), `next/navigation` (`usePathname`), Vitest + `@testing-library/react`.

---

## File Structure

**New files:**
- `lib/nav/items.ts` — nav config, role filtering, bottom-bar shortcuts, active-state helpers (the single source of truth).
- `lib/nav/initials.ts` — `getInitials()` helper (extracted from the two copies in `AppNav`/`MobileSessionSheet`).
- `lib/hooks/useSidebarCollapsed.ts` — per-user collapse state (localStorage, SSR-safe).
- `components/ui/nav-icons.tsx` — `NavIcon` keyed by a stable icon **id** (today they're keyed by label).
- `components/ui/NavMenu.tsx` — the canonical grouped item list, shared by sidebar + drawer.
- `components/ui/AccountBlock.tsx` — identity + theme toggle + sign out, shared by sidebar footer + drawer footer.
- `components/ui/SideNav.tsx` — desktop sidebar + icon rail + collapse toggle.
- `components/ui/NavDrawer.tsx` — mobile modal drawer wrapping `NavMenu` + `AccountBlock`.
- `components/ui/MobileTabBar.tsx` — the fixed 5-cell bottom bar (4 shortcuts + More).

**Modified files:**
- `components/ui/AppNav.tsx` — rewritten as the orchestrator.
- `app/(app)/layout.tsx` — `flex-col` → `flex-col md:flex-row`.
- `AGENTS.md` — nav description.

**Deleted files:**
- `components/ui/MobileSessionSheet.tsx` — content folded into `NavDrawer` + `AccountBlock`.

**New test files:**
- `__tests__/lib/nav/items.test.ts`
- `__tests__/lib/nav/initials.test.ts`
- `__tests__/lib/hooks/useSidebarCollapsed.test.tsx`
- `__tests__/components/ui/NavMenu.test.tsx`
- `__tests__/components/ui/SideNav.test.tsx`
- `__tests__/components/ui/NavDrawer.test.tsx`
- `__tests__/components/ui/MobileTabBar.test.tsx`

---

## Task 1: Nav config + pure helpers (`lib/nav/items.ts`)

This is the single source of truth. Pure functions only — fully unit-testable in the node environment.

**Files:**
- Create: `lib/nav/items.ts`
- Test: `__tests__/lib/nav/items.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/nav/items.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BOTTOM_BAR_SHORTCUTS,
  isItemActive,
  isMoreActive,
  navGroupsFor,
} from "@/lib/nav/items";

describe("navGroupsFor", () => {
  it("gives lead/admin every group", () => {
    const groups = navGroupsFor("lead");
    const ids = groups.map((g) => g.id);
    expect(ids).toEqual(["overview", "pipeline", "schedule"]);
    const pipeline = groups.find((g) => g.id === "pipeline");
    expect(pipeline?.items.map((i) => i.href)).toEqual([
      "/customers",
      "/site-measures",
      "/estimates",
    ]);
  });

  it("gives admin the same set as lead", () => {
    expect(navGroupsFor("admin")).toEqual(navGroupsFor("lead"));
  });

  it("gives crew only My Schedule and drops emptied groups", () => {
    const groups = navGroupsFor("crew");
    expect(groups.map((g) => g.id)).toEqual(["schedule"]);
    expect(groups[0]?.items.map((i) => i.href)).toEqual(["/my-schedule"]);
  });

  it("hides Schedule Manager from crew but keeps it for lead", () => {
    const crewSchedule = navGroupsFor("crew").find((g) => g.id === "schedule");
    const leadSchedule = navGroupsFor("lead").find((g) => g.id === "schedule");
    expect(crewSchedule?.items.some((i) => i.href === "/schedule")).toBe(false);
    expect(leadSchedule?.items.some((i) => i.href === "/schedule")).toBe(true);
  });
});

describe("BOTTOM_BAR_SHORTCUTS", () => {
  it("is exactly the four agreed shortcuts in order", () => {
    expect(BOTTOM_BAR_SHORTCUTS.map((s) => s.href)).toEqual([
      "/",
      "/customers",
      "/estimates",
      "/my-schedule",
    ]);
    expect(BOTTOM_BAR_SHORTCUTS.map((s) => s.label)).toEqual([
      "Home",
      "Customers",
      "Estimates",
      "Schedule",
    ]);
  });
});

describe("isItemActive", () => {
  it("matches the dashboard only on an exact root path", () => {
    expect(isItemActive("/", "/")).toBe(true);
    expect(isItemActive("/", "/customers")).toBe(false);
  });

  it("matches a section on its sub-routes via prefix", () => {
    expect(isItemActive("/estimates", "/estimates/123")).toBe(true);
    expect(isItemActive("/customers", "/customers")).toBe(true);
  });

  it("does not let /my-schedule match /schedule", () => {
    expect(isItemActive("/my-schedule", "/schedule")).toBe(false);
  });
});

describe("isMoreActive", () => {
  it("is false when a bottom-bar shortcut owns the route", () => {
    expect(isMoreActive("/")).toBe(false);
    expect(isMoreActive("/estimates/9")).toBe(false);
    expect(isMoreActive("/my-schedule")).toBe(false);
  });

  it("is true on drawer-only destinations", () => {
    expect(isMoreActive("/site-measures")).toBe(true);
    expect(isMoreActive("/schedule")).toBe(true);
    expect(isMoreActive("/settings")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/nav/items.test.ts`
Expected: FAIL — `Cannot find module '@/lib/nav/items'`.

- [ ] **Step 3: Write the implementation**

Create `lib/nav/items.ts`:

```ts
import { type Role, hasMinRole } from "@/lib/auth/permissions";

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
    items: [{ href: "/", label: "Dashboard", icon: "dashboard", minRole: "lead" }],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    items: [
      { href: "/customers", label: "Customers", icon: "customers", minRole: "lead" },
      { href: "/site-measures", label: "Site Measures", icon: "siteMeasures", minRole: "lead" },
      { href: "/estimates", label: "Estimates", icon: "estimates", minRole: "lead" },
    ],
  },
  {
    id: "schedule",
    label: "Schedule",
    items: [
      { href: "/my-schedule", label: "My Schedule", icon: "myschedule", minRole: "crew" },
      { href: "/schedule", label: "Schedule Manager", icon: "scheduleManager", minRole: "lead" },
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/nav/items.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/nav/items.ts __tests__/lib/nav/items.test.ts
git commit -m "feat(nav): shared nav config + role filtering + active-state helpers"
```

---

## Task 2: `getInitials` helper (`lib/nav/initials.ts`)

Extract the duplicated avatar-initials logic so the new account components share one tested copy.

**Files:**
- Create: `lib/nav/initials.ts`
- Test: `__tests__/lib/nav/initials.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/nav/initials.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getInitials } from "@/lib/nav/initials";

describe("getInitials", () => {
  it("uses first + last initial of a full name", () => {
    expect(getInitials("Alex Lead", null)).toBe("AL");
  });

  it("uses a single initial for a one-word name", () => {
    expect(getInitials("Cher", null)).toBe("C");
  });

  it("falls back to the email's first letter when no name", () => {
    expect(getInitials(null, "boss@sqft.dev")).toBe("B");
  });

  it("returns a dot placeholder when nothing is available", () => {
    expect(getInitials(null, null)).toBe("··");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/nav/initials.test.ts`
Expected: FAIL — `Cannot find module '@/lib/nav/initials'`.

- [ ] **Step 3: Write the implementation**

Create `lib/nav/initials.ts` (verbatim logic lifted from the current `AppNav.getInitials`):

```ts
export function getInitials(name?: string | null, email?: string | null): string {
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/nav/initials.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/nav/initials.ts __tests__/lib/nav/initials.test.ts
git commit -m "feat(nav): extract shared getInitials helper"
```

---

## Task 3: `useSidebarCollapsed` hook (`lib/hooks/useSidebarCollapsed.ts`)

Per-user collapse state, SSR-safe (renders expanded on the server, reconciles on mount to avoid a hydration flash).

**Files:**
- Create: `lib/hooks/useSidebarCollapsed.ts`
- Test: `__tests__/lib/hooks/useSidebarCollapsed.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/hooks/useSidebarCollapsed.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed";

beforeEach(() => localStorage.clear());

describe("useSidebarCollapsed", () => {
  it("defaults to expanded (not collapsed)", () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);
  });

  it("reads a previously persisted collapsed state on mount", () => {
    localStorage.setItem("sqft.sidebar.collapsed", "1");
    const { result } = renderHook(() => useSidebarCollapsed());
    expect(result.current.collapsed).toBe(true);
  });

  it("toggle flips and persists the state", () => {
    const { result } = renderHook(() => useSidebarCollapsed());
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem("sqft.sidebar.collapsed")).toBe("1");
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem("sqft.sidebar.collapsed")).toBe("0");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/lib/hooks/useSidebarCollapsed.test.tsx`
Expected: FAIL — `Cannot find module '@/lib/hooks/useSidebarCollapsed'`.

- [ ] **Step 3: Write the implementation**

Create `lib/hooks/useSidebarCollapsed.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

const KEY = "sqft.sidebar.collapsed";

export function useSidebarCollapsed() {
  // Default expanded so SSR and first client render agree (no flash).
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(KEY, next ? "1" : "0");
      return next;
    });
  }

  return { collapsed, toggle };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/lib/hooks/useSidebarCollapsed.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/hooks/useSidebarCollapsed.ts __tests__/lib/hooks/useSidebarCollapsed.test.tsx
git commit -m "feat(nav): useSidebarCollapsed hook with per-user persistence"
```

---

## Task 4: Nav icons (`components/ui/nav-icons.tsx`)

Move the inline SVGs out of `AppNav` and key them by stable `IconId` (not by label). Include a new `more` icon (three dots) and a `chevron` for the collapse toggle.

**Files:**
- Create: `components/ui/nav-icons.tsx`

- [ ] **Step 1: Write the component (no test — pure presentational, exercised via the component tests in later tasks)**

Create `components/ui/nav-icons.tsx`:

```tsx
import type { ReactNode } from "react";
import type { IconId } from "@/lib/nav/items";

export function NavIcon({
  icon,
  active = false,
  size = 22,
  title,
}: {
  icon: IconId;
  active?: boolean;
  size?: number;
  title?: string;
}) {
  const props = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: active ? 2 : 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": title ? undefined : (true as const),
  };
  const paths: Record<IconId, ReactNode> = {
    dashboard: (
      <>
        <path d="M3 12L12 4l9 8" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
      </>
    ),
    customers: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      </>
    ),
    siteMeasures: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),
    estimates: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M12 7v10" />
        <path d="M14.5 9.5c-.7-.7-1.7-.9-2.5-.5-1 .5-1.2 1.7-.4 2.3.7.5 1.7.5 2.4 1 .8.6.6 1.8-.4 2.3-.8.4-1.8.2-2.5-.5" />
      </>
    ),
    myschedule: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="1.5" />
        <path d="M4 9h16M9 3v4M15 3v4" />
        <path d="M9 14l2 2 3.5-3.8" />
      </>
    ),
    scheduleManager: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="1.5" />
        <path d="M4 9h16M9 3v4M15 3v4" />
        <path d="M8 13h3M8 16h5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
      </>
    ),
  };
  return (
    <svg {...props}>
      {title ? <title>{title}</title> : null}
      {paths[icon]}
    </svg>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `components/ui/nav-icons.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/ui/nav-icons.tsx
git commit -m "feat(nav): NavIcon component keyed by stable icon id"
```

---

## Task 5: `AccountBlock` (`components/ui/AccountBlock.tsx`)

Shared identity + theme + sign-out, used by the sidebar footer and the drawer footer. Two layouts via a `variant` prop: `"inline"` (stacked, for the drawer) and `"compact"` (single row, for the sidebar footer).

**Files:**
- Create: `components/ui/AccountBlock.tsx`

- [ ] **Step 1: Write the component (exercised by SideNav/NavDrawer tests)**

Create `components/ui/AccountBlock.tsx`:

```tsx
"use client";

import { signOut, useSession } from "next-auth/react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/nav/initials";

export function AccountBlock({
  variant = "inline",
}: {
  variant?: "inline" | "compact";
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const initials = getInitials(user?.name, user?.email);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 w-9 h-9 rounded-full",
            "bg-[var(--surface-2)] border border-[var(--line)]",
            "flex items-center justify-center",
            "font-[var(--font-mono)] text-[12px] font-[600] text-[var(--accent)]"
          )}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-[600] tracking-[var(--ls-snug)] leading-tight truncate">
            {user?.name ?? "Signed in"}
          </div>
          {user?.role && (
            <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[var(--ls-cap)] text-[var(--muted)] mt-0.5">
              {user.role}
            </div>
          )}
        </div>
        {variant === "inline" && <ThemeToggle />}
      </div>

      {variant === "compact" && (
        <div className="flex items-center justify-between gap-2">
          <ThemeToggle />
        </div>
      )}

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className={cn(
          "w-full flex items-center justify-center gap-2",
          "px-3 py-2.5 rounded-[var(--r)]",
          "bg-[var(--accent)] hover:bg-[var(--accent-d)]",
          "text-white font-[var(--font-mono)] text-[11px] tracking-[var(--ls-cap)] uppercase",
          "transition-colors duration-150 active:translate-y-[1px]"
        )}
      >
        <span>Sign out</span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/AccountBlock.tsx
git commit -m "feat(nav): shared AccountBlock (identity + theme + sign out)"
```

---

## Task 6: `NavMenu` (`components/ui/NavMenu.tsx`)

The canonical grouped item list. Renders group labels + role-filtered items + the Settings footer item, with active-state styling. Shared by the sidebar (expanded) and the drawer. An `onNavigate` callback lets the drawer close itself when a link is tapped.

**Files:**
- Create: `components/ui/NavMenu.tsx`
- Test: `__tests__/components/ui/NavMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/ui/NavMenu.test.tsx`:

```tsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NavMenu } from "@/components/ui/NavMenu";

describe("NavMenu", () => {
  it("renders all lead destinations grouped, plus Settings", () => {
    render(<NavMenu role="lead" pathname="/estimates" />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Site Measures")).toBeInTheDocument();
    expect(screen.getByText("Estimates")).toBeInTheDocument();
    expect(screen.getByText("Schedule Manager")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("hides lead-only destinations and Settings from crew", () => {
    render(<NavMenu role="crew" pathname="/my-schedule" />);
    expect(screen.getByText("My Schedule")).toBeInTheDocument();
    expect(screen.queryByText("Customers")).not.toBeInTheDocument();
    expect(screen.queryByText("Schedule Manager")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("marks the active destination with aria-current", () => {
    render(<NavMenu role="lead" pathname="/estimates/9" />);
    expect(screen.getByRole("link", { name: /Estimates/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: /Customers/ })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("fires onNavigate when a link is clicked", () => {
    const onNavigate = vi.fn();
    render(<NavMenu role="lead" pathname="/" onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("link", { name: /Customers/ }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/components/ui/NavMenu.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/NavMenu'`.

- [ ] **Step 3: Write the implementation**

Create `components/ui/NavMenu.tsx`:

```tsx
"use client";

import Link from "next/link";
import { NavIcon } from "@/components/ui/nav-icons";
import { cn } from "@/lib/cn";
import {
  type NavItem,
  SETTINGS_ITEM,
  canSeeSettings,
  isItemActive,
  navGroupsFor,
} from "@/lib/nav/items";

export function NavMenu({
  role,
  pathname,
  onNavigate,
}: {
  role: string;
  pathname: string;
  onNavigate?: () => void;
}) {
  const groups = navGroupsFor(role);

  function Row({ item }: { item: NavItem }) {
    const active = isItemActive(item.href, pathname);
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-[var(--r)]",
          "text-[13px] transition-colors duration-150",
          active
            ? "text-[var(--accent)] font-[600] bg-[var(--surface-2)]"
            : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
        )}
      >
        <NavIcon icon={item.icon} active={active} size={18} />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-0.5">
      {groups.map((group) => (
        <div key={group.id}>
          <div className="font-[var(--font-mono)] text-[9px] tracking-[var(--ls-cap)] uppercase text-[var(--muted)] px-4 pt-3 pb-1">
            {group.label}
          </div>
          {group.items.map((item) => (
            <Row key={item.href} item={item} />
          ))}
        </div>
      ))}
      {canSeeSettings(role) && (
        <div className="mt-2 pt-2 border-t border-[var(--line)]">
          <Row item={SETTINGS_ITEM} />
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/components/ui/NavMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/NavMenu.tsx __tests__/components/ui/NavMenu.test.tsx
git commit -m "feat(nav): NavMenu shared grouped destination list"
```

---

## Task 7: `SideNav` (`components/ui/SideNav.tsx`)

Desktop sidebar: brand + collapse toggle, `NavMenu` (expanded) or an icon rail (collapsed), and `AccountBlock` footer. Collapse state from `useSidebarCollapsed`.

**Files:**
- Create: `components/ui/SideNav.tsx`
- Test: `__tests__/components/ui/SideNav.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/ui/SideNav.test.tsx`:

```tsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/estimates" }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Alex Lead", role: "lead" } } }),
  signOut: vi.fn(),
}));

import { SideNav } from "@/components/ui/SideNav";

beforeEach(() => localStorage.clear());

describe("SideNav", () => {
  it("renders grouped destinations when expanded", () => {
    render(<SideNav />);
    expect(screen.getByText("Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Customers")).toBeInTheDocument();
  });

  it("collapsing hides group labels and persists the state", () => {
    render(<SideNav />);
    fireEvent.click(screen.getByRole("button", { name: /collapse sidebar/i }));
    expect(screen.queryByText("Pipeline")).not.toBeInTheDocument();
    expect(localStorage.getItem("sqft.sidebar.collapsed")).toBe("1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/components/ui/SideNav.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/SideNav'`.

- [ ] **Step 3: Write the implementation**

Create `components/ui/SideNav.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { AccountBlock } from "@/components/ui/AccountBlock";
import { NavIcon } from "@/components/ui/nav-icons";
import { NavMenu } from "@/components/ui/NavMenu";
import { cn } from "@/lib/cn";
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed";
import {
  SETTINGS_ITEM,
  canSeeSettings,
  isItemActive,
  navGroupsFor,
} from "@/lib/nav/items";

export function SideNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { collapsed, toggle } = useSidebarCollapsed();
  const role = session?.user?.role ?? "crew";

  return (
    <aside
      className={cn(
        "hidden md:flex order-1 shrink-0 flex-col h-full",
        "bg-[var(--surface)] border-r border-[var(--line)]",
        "transition-[width] duration-200",
        collapsed ? "w-[56px]" : "w-[208px]"
      )}
    >
      <div
        className={cn(
          "flex items-center h-[60px] px-4 shrink-0",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {!collapsed && (
          <span className="text-[18px] font-[800] tracking-[-0.025em] select-none leading-none">
            <em className="not-italic text-[var(--accent)]">Sq</em>Ft
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors text-[14px] leading-none px-1"
        >
          {collapsed ? "⟩" : "⟨"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2">
        {collapsed ? (
          <IconRail role={role} pathname={pathname} />
        ) : (
          <NavMenu role={role} pathname={pathname} />
        )}
      </div>

      {!collapsed && (
        <div className="shrink-0 p-4 border-t border-[var(--line)]">
          <AccountBlock variant="compact" />
        </div>
      )}
    </aside>
  );
}

function IconRail({ role, pathname }: { role: string; pathname: string }) {
  const items = navGroupsFor(role).flatMap((g) => g.items);
  if (canSeeSettings(role)) items.push(SETTINGS_ITEM);
  return (
    <div className="flex flex-col items-center gap-1 pt-1">
      {items.map((item) => {
        const active = isItemActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "w-9 h-9 rounded-[var(--r)] flex items-center justify-center transition-colors",
              active
                ? "text-[var(--accent)] bg-[var(--surface-2)]"
                : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
            )}
          >
            <NavIcon icon={item.icon} active={active} size={19} />
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/components/ui/SideNav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/SideNav.tsx __tests__/components/ui/SideNav.test.tsx
git commit -m "feat(nav): desktop SideNav with collapsible icon rail"
```

---

## Task 8: `NavDrawer` (`components/ui/NavDrawer.tsx`)

Mobile modal drawer: scrim + left-sliding panel containing brand, `AccountBlock` (inline) and `NavMenu`. Closes on Esc, scrim click, and link navigation. Locks body scroll while open (patterns lifted from the current `MobileSessionSheet`).

**Files:**
- Create: `components/ui/NavDrawer.tsx`
- Test: `__tests__/components/ui/NavDrawer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/ui/NavDrawer.test.tsx`:

```tsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Alex Lead", role: "lead" } } }),
  signOut: vi.fn(),
}));

import { NavDrawer } from "@/components/ui/NavDrawer";

describe("NavDrawer", () => {
  it("renders the full grouped menu when open", () => {
    render(
      <NavDrawer open onClose={() => {}} role="lead" pathname="/estimates" />
    );
    expect(screen.getByText("Customers")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("calls onClose when the scrim is clicked", () => {
    const onClose = vi.fn();
    render(
      <NavDrawer open onClose={onClose} role="lead" pathname="/estimates" />
    );
    fireEvent.click(screen.getByTestId("nav-drawer-scrim"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(
      <NavDrawer open onClose={onClose} role="lead" pathname="/estimates" />
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/components/ui/NavDrawer.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/NavDrawer'`.

- [ ] **Step 3: Write the implementation**

Create `components/ui/NavDrawer.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { AccountBlock } from "@/components/ui/AccountBlock";
import { NavMenu } from "@/components/ui/NavMenu";
import { cn } from "@/lib/cn";

export function NavDrawer({
  open,
  onClose,
  role,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  role: string;
  pathname: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div
        data-testid="nav-drawer-scrim"
        onClick={onClose}
        aria-hidden="true"
        className={cn(
          "md:hidden fixed inset-0 z-[400] bg-black/40 backdrop-blur-[2px]",
          "transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          "md:hidden fixed top-0 bottom-0 left-0 z-[401] w-[80%] max-w-[320px]",
          "bg-[var(--surface)] border-r border-[var(--line)] shadow-[var(--shadow-md)]",
          "flex flex-col transition-transform duration-[220ms] ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center h-[56px] px-5 shrink-0 border-b border-[var(--line)]">
          <span className="text-[18px] font-[800] tracking-[-0.025em] select-none leading-none">
            <em className="not-italic text-[var(--accent)]">Sq</em>Ft
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <NavMenu role={role} pathname={pathname} onNavigate={onClose} />
        </div>
        <div
          className="shrink-0 p-4 border-t border-[var(--line)]"
          style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))" }}
        >
          <AccountBlock variant="inline" />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/components/ui/NavDrawer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/NavDrawer.tsx __tests__/components/ui/NavDrawer.test.tsx
git commit -m "feat(nav): mobile NavDrawer (full menu + account)"
```

---

## Task 9: `MobileTabBar` (`components/ui/MobileTabBar.tsx`)

The fixed 5-cell bottom bar: 4 shortcuts + a More button that opens the drawer. Single-line labels, fixed height.

**Files:**
- Create: `components/ui/MobileTabBar.tsx`
- Test: `__tests__/components/ui/MobileTabBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/ui/MobileTabBar.test.tsx`:

```tsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MobileTabBar } from "@/components/ui/MobileTabBar";

describe("MobileTabBar", () => {
  it("renders the four shortcuts plus More", () => {
    render(<MobileTabBar pathname="/" onMore={() => {}} />);
    for (const label of ["Home", "Customers", "Estimates", "Schedule", "More"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the shortcut that owns the route as active", () => {
    render(<MobileTabBar pathname="/estimates/9" onMore={() => {}} />);
    expect(screen.getByRole("link", { name: /Estimates/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("marks More active on a drawer-only route", () => {
    render(<MobileTabBar pathname="/site-measures" onMore={() => {}} />);
    expect(screen.getByRole("button", { name: /More/ })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  it("calls onMore when More is tapped", () => {
    const onMore = vi.fn();
    render(<MobileTabBar pathname="/" onMore={onMore} />);
    fireEvent.click(screen.getByRole("button", { name: /More/ }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run __tests__/components/ui/MobileTabBar.test.tsx`
Expected: FAIL — `Cannot find module '@/components/ui/MobileTabBar'`.

- [ ] **Step 3: Write the implementation**

Create `components/ui/MobileTabBar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { NavIcon } from "@/components/ui/nav-icons";
import { cn } from "@/lib/cn";
import { BOTTOM_BAR_SHORTCUTS, isItemActive, isMoreActive } from "@/lib/nav/items";

const cellBase = cn(
  "flex flex-col items-center justify-center gap-[3px]",
  "py-[7px] px-1 min-h-[50px] rounded-lg",
  "font-[var(--font-mono)] text-[9.5px] tracking-[.04em]",
  "transition-colors duration-150 relative whitespace-nowrap"
);

export function MobileTabBar({
  pathname,
  onMore,
}: {
  pathname: string;
  onMore: () => void;
}) {
  const moreActive = isMoreActive(pathname);
  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        "md:hidden order-3 shrink-0 relative z-[60]",
        "bg-[var(--surface)] border-t border-[var(--line)]",
        "py-1.5 px-1 pb-[calc(6px+env(safe-area-inset-bottom,0px))]"
      )}
    >
      <div className="grid grid-cols-5 gap-0.5 max-w-[680px] mx-auto">
        {BOTTOM_BAR_SHORTCUTS.map((s) => {
          const active = isItemActive(s.href, pathname);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={cn(cellBase, active ? "text-[var(--accent)]" : "text-[var(--muted)]")}
            >
              {active && (
                <span className="absolute top-[-7px] left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[var(--accent)] rounded-b-sm" />
              )}
              <NavIcon icon={s.icon} active={active} size={22} />
              <span>{s.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          aria-current={moreActive ? "page" : undefined}
          aria-haspopup="dialog"
          className={cn(cellBase, "bg-transparent border-none cursor-pointer", moreActive ? "text-[var(--accent)]" : "text-[var(--muted)]")}
        >
          {moreActive && (
            <span className="absolute top-[-7px] left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[var(--accent)] rounded-b-sm" />
          )}
          <NavIcon icon="more" active={moreActive} size={22} />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run __tests__/components/ui/MobileTabBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/ui/MobileTabBar.tsx __tests__/components/ui/MobileTabBar.test.tsx
git commit -m "feat(nav): fixed 5-cell MobileTabBar"
```

---

## Task 10: Rewrite `AppNav` orchestrator + crew top bar

Wire the surfaces together. `AppNav` renders `SideNav` (md+, all roles), and on mobile renders either the `MobileTabBar`+`NavDrawer` (lead+) or a slim crew top bar whose avatar opens the `NavDrawer` (crew). The drawer's open state lives here.

**Files:**
- Modify (full rewrite): `components/ui/AppNav.tsx`

- [ ] **Step 1: Replace the file contents**

Replace all of `components/ui/AppNav.tsx` with:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { NavDrawer } from "@/components/ui/NavDrawer";
import { MobileTabBar } from "@/components/ui/MobileTabBar";
import { SideNav } from "@/components/ui/SideNav";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/nav/initials";

export function AppNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const role = session?.user?.role ?? "crew";
  const isCrew = role === "crew";

  return (
    <>
      <SideNav />

      {/* Mobile: crew gets a slim top bar; everyone else gets the bottom bar. */}
      {isCrew ? (
        <header
          className={cn(
            "md:hidden order-1 shrink-0 z-[60]",
            "flex items-center justify-between h-[52px] px-4",
            "bg-[var(--surface)] border-b border-[var(--line)]"
          )}
        >
          <span className="text-[18px] font-[800] tracking-[-0.025em] leading-none">
            <em className="not-italic text-[var(--accent)]">Sq</em>Ft
          </span>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className={cn(
              "w-[34px] h-[34px] rounded-full",
              "bg-[var(--surface-2)] border border-[var(--line)]",
              "flex items-center justify-center",
              "font-[var(--font-mono)] text-[11px] font-[600] text-[var(--accent)]"
            )}
          >
            {getInitials(session?.user?.name, session?.user?.email)}
          </button>
        </header>
      ) : (
        <MobileTabBar pathname={pathname} onMore={() => setDrawerOpen(true)} />
      )}

      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={role}
        pathname={pathname}
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck + run the full nav test set**

Run: `npx tsc --noEmit && npx vitest run __tests__/components/ui __tests__/lib/nav __tests__/lib/hooks`
Expected: typecheck clean; all nav tests PASS.

- [ ] **Step 3: Commit**

```bash
git add components/ui/AppNav.tsx
git commit -m "feat(nav): AppNav orchestrator (sidebar + bottom bar/drawer + crew top bar)"
```

---

## Task 11: Update the app layout to a sidebar row

Flip the shell so the sidebar sits beside the content on desktop while the mobile bottom bar / crew top bar still stack via the existing `order-*` utilities.

**Files:**
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 1: Edit the layout**

In `app/(app)/layout.tsx`, change the outer wrapper from a column to a responsive row. Replace:

```tsx
      <div className="flex flex-col h-[100dvh] overflow-hidden">
        <AppNav />
        <main className="order-2 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="max-w-[1200px] mx-auto px-[14px] md:px-8 py-8 pt-4 md:pt-8">
            {children}
          </div>
        </main>
      </div>
```

with:

```tsx
      <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden">
        <AppNav />
        <main className="order-2 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="max-w-[1200px] mx-auto px-[14px] md:px-8 py-8 pt-4 md:pt-8">
            {children}
          </div>
        </main>
      </div>
```

(`AppNav`'s `SideNav` is `order-1`, `main` is `order-2`, `MobileTabBar` is `order-3`, and the crew top bar is `order-1` — so on `md+` the sidebar sits left of main, and on mobile main stacks above the bottom bar / below the crew top bar, exactly as before.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/layout.tsx"
git commit -m "feat(nav): sidebar+main row layout on desktop"
```

---

## Task 12: Delete `MobileSessionSheet`

Its identity/theme/sign-out content now lives in `AccountBlock` inside `NavDrawer`. Remove the dead component and confirm nothing else imports it.

**Files:**
- Delete: `components/ui/MobileSessionSheet.tsx`

- [ ] **Step 1: Confirm there are no remaining importers**

Run: `git grep -n "MobileSessionSheet"`
Expected: no results (Task 10 removed the only import). If any remain, remove them before deleting.

- [ ] **Step 2: Delete the file**

```bash
git rm components/ui/MobileSessionSheet.tsx
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(nav): remove MobileSessionSheet (folded into NavDrawer)"
```

---

## Task 13: Update E2E for the new nav structure

Find and fix any Playwright specs that select the old top-bar tabs, the floating avatar "seal", or the 7-cell bottom bar. Crew still lands on `/my-schedule`.

**Files:**
- Modify: whichever specs under `e2e/` reference nav (discover in Step 1)

- [ ] **Step 1: Find nav-coupled e2e selectors**

Run:
```bash
git grep -nE "Schedule Manager|Site Measures|Open session menu|getByRole\('navigation'\)|nav" e2e
```
Expected: a list of specs touching nav. For each hit, inspect whether it depends on the old structure.

- [ ] **Step 2: Update the selectors**

For desktop specs, the destinations are now links inside the sidebar `nav[aria-label="Main navigation"]` — `page.getByRole("link", { name: "Customers" })` etc. still resolve. For mobile specs that opened the session sheet via "Open session menu", switch to opening the drawer: `await page.getByRole("button", { name: "More" }).click()` (lead+) then assert links inside `role="dialog"`. Replace any assertion on a literal 7-cell bar with the 5-cell bar (`Home`, `Customers`, `Estimates`, `Schedule`, `More`).

Apply the minimal edits needed so each spec targets the new chrome. Do not change what the specs verify, only how they locate nav.

- [ ] **Step 3: Run the affected e2e specs**

Run (single worker to match CI — see repo gotchas): `npm run test:e2e -- --workers=1`
Expected: PASS. If a worktree-local run can't boot (missing deps / DB), note it and rely on CI; do not skip fixing obvious selector breaks.

- [ ] **Step 4: Commit**

```bash
git add e2e
git commit -m "test(e2e): point nav specs at the new sidebar/drawer"
```

---

## Task 14: Docs + full verification

Update `AGENTS.md` and run the whole gate.

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the AGENTS.md nav description**

In `AGENTS.md`, under "Where things live", update the navigation sentence to read (adjust surrounding prose as needed):

```
  Navigation is defined once in `lib/nav/items.ts` (grouped destinations,
  role-gating, the mobile bottom-bar shortcuts, and active-state helpers) and
  rendered by `components/ui/AppNav.tsx` — a persistent left **SideNav** on
  desktop, and a fixed `MobileTabBar` (4 shortcuts + More) opening a full
  `NavDrawer` on mobile. `MyScheduleView` / Schedule Manager wiring is
  unchanged.
```

- [ ] **Step 2: Run lint, typecheck, and the unit suite**

Run: `npx biome ci . && npx tsc --noEmit && npx vitest run`
Expected: lint clean, typecheck clean, all unit/component tests PASS.

- [ ] **Step 3: Manual smoke (if the app boots in this environment)**

Run `npm run dev`, then verify at a desktop width: sidebar shows groups, collapse toggle persists across reload, active item highlights. At a mobile width: bottom bar has 5 fixed cells with no label wrapping, More opens the drawer, drawer links navigate and close it. Sign in as crew (seed has crew users): mobile shows the slim top bar (no bottom bar), avatar opens the drawer with only My Schedule. (If the worktree can't boot per repo gotchas, rely on CI + the component tests.)

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(nav): document the shared nav config + new chrome"
```

---

## Self-Review Notes (author)

- **Spec coverage:** IA/grouping → Task 1; bottom-bar shortcuts + Schedule→/my-schedule → Task 1/9; per-user collapse → Task 3/7; sidebar + rail → Task 7; bottom bar + drawer → Task 8/9; crew top bar → Task 10; absorb MobileSessionSheet → Task 5/8/12; layout row → Task 11; a11y (dialog, aria-current, safe-area) → Tasks 6–9; tests → each task + Task 13; docs → Task 14. All spec sections map to a task.
- **Type consistency:** `IconId`, `NavItem`, `NavGroup`, `navGroupsFor`, `canSeeSettings`, `isItemActive`, `isMoreActive`, `BOTTOM_BAR_SHORTCUTS`, `SETTINGS_ITEM` defined in Task 1 and used with identical signatures in Tasks 5–11. `useSidebarCollapsed` returns `{ collapsed, toggle }`, consumed exactly so in Task 7. `getInitials(name, email)` defined in Task 2, used in Tasks 5 and 10.
- **No placeholders:** every code step contains full source; every command has an expected result.
