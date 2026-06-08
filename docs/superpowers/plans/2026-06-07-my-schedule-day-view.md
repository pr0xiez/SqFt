# My Schedule — mobile-first day view — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new, read-only, mobile-first `/my-schedule` page where a logged-in user sees their (or the team's) events one day or one week at a time, navigates ‹ Today ›, and taps an event to open a job-card detail sheet.

**Architecture:** One agenda-list layout. A pure module (`lib/schedule/agenda.ts`) turns the flat events array into date-grouped sections given a `scope` (mine/team) and `range` (day/week) — the four "views" are just filters, no per-view layout branches. The events API payload is extended with a derived address + customer phone so the card and job card need no extra fetch. A thin client view (`MyScheduleView`) holds toggle/nav state and renders shared `EventCard` / `JobCard` components. The existing editable `/schedule` grid is untouched.

**Tech Stack:** Next.js (App Router, server + client components), React, react-query (`useEvents`), Prisma/Postgres, Vitest + Testing Library (jsdom per-file), Biome.

**Spec:** `docs/superpowers/specs/2026-06-07-my-schedule-day-view-design.md`

---

## File Structure

New files:

- `lib/schedule/agenda.ts` — pure agenda logic: `Scope`/`Range` types, `eventOccursOn`, `weekDates`, `sectionDates`, `shiftFocus`, `formatSectionLabel`, `formatClock`, `AgendaSection`, `buildAgendaSections`.
- `lib/events/serialize.ts` — pure `resolveEventAddress` (estimate-location → customer-location → null).
- `components/schedule/eventMeta.ts` — `EVENT_ACCENT` / `EVENT_LABEL` maps shared by card + job card.
- `components/schedule/EventCard.tsx` — one read-only agenda card (button).
- `components/schedule/JobCard.tsx` — bottom-sheet detail.
- `components/schedule/DayAgenda.tsx` — renders sections (header + cards / empty).
- `components/schedule/MyScheduleView.tsx` — client view: scope/range/focused-date state + nav + job-card state.
- `app/(app)/my-schedule/page.tsx` — server shell (passes `currentUserId`).

Modified files:

- `lib/repositories/eventRepo.ts` — richer include + map in `listEvents` only (create/update untouched).
- `lib/hooks/useEvents.ts` — extend `CalEvent` with optional `address`, `estimateNumber`, `customer.phone`.
- `components/ui/AppNav.tsx` — add nav entry + icon, let crew see it, fix mobile grid columns.

Tests:

- `__tests__/lib/schedule/agenda.test.ts`
- `__tests__/lib/events/serialize.test.ts`
- `__tests__/components/schedule/EventCard.test.tsx`
- `__tests__/components/schedule/JobCard.test.tsx`
- `__tests__/components/schedule/MyScheduleView.test.tsx`

---

## Task 1: Pure agenda module

**Files:**
- Create: `lib/schedule/agenda.ts`
- Test: `__tests__/lib/schedule/agenda.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/schedule/agenda.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  type AgendaEvent,
  buildAgendaSections,
  eventOccursOn,
  formatClock,
  formatSectionLabel,
  sectionDates,
  shiftFocus,
  weekDates,
} from "@/lib/schedule/agenda";

function ev(p: Partial<AgendaEvent>): AgendaEvent {
  return {
    id: 1,
    type: "job",
    title: "Job",
    startTime: "08:00",
    endTime: "17:00",
    date: "2026-06-08T00:00:00.000Z",
    endDate: null,
    assignees: [],
    ...p,
  } as AgendaEvent;
}

describe("formatClock", () => {
  it("morning", () => expect(formatClock("08:00")).toBe("8:00a"));
  it("noon", () => expect(formatClock("12:00")).toBe("12:00p"));
  it("afternoon", () => expect(formatClock("13:05")).toBe("1:05p"));
  it("midnight", () => expect(formatClock("00:00")).toBe("12:00a"));
});

describe("eventOccursOn", () => {
  it("single day matches its date", () =>
    expect(eventOccursOn(ev({}), "2026-06-08")).toBe(true));
  it("single day excludes other days", () =>
    expect(eventOccursOn(ev({}), "2026-06-09")).toBe(false));
  it("multi-day spans inclusive range", () => {
    const e = ev({ endDate: "2026-06-10T00:00:00.000Z" });
    expect(eventOccursOn(e, "2026-06-09")).toBe(true);
    expect(eventOccursOn(e, "2026-06-10")).toBe(true);
    expect(eventOccursOn(e, "2026-06-11")).toBe(false);
  });
});

describe("weekDates", () => {
  it("returns Mon..Sun of the focused week", () => {
    expect(weekDates("2026-06-10")).toEqual([
      "2026-06-08", "2026-06-09", "2026-06-10",
      "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14",
    ]);
  });
});

describe("sectionDates", () => {
  it("day → one date", () =>
    expect(sectionDates("2026-06-08", "day")).toEqual(["2026-06-08"]));
  it("week → seven dates", () =>
    expect(sectionDates("2026-06-08", "week")).toHaveLength(7));
});

describe("shiftFocus", () => {
  it("day forward", () =>
    expect(shiftFocus("2026-06-08", "day", 1)).toBe("2026-06-09"));
  it("day back", () =>
    expect(shiftFocus("2026-06-08", "day", -1)).toBe("2026-06-07"));
  it("week forward", () =>
    expect(shiftFocus("2026-06-08", "week", 1)).toBe("2026-06-15"));
});

describe("formatSectionLabel", () => {
  it("formats weekday and month/day", () =>
    expect(formatSectionLabel("2026-06-08")).toBe("Mon · Jun 8"));
});

describe("buildAgendaSections", () => {
  const mine = ev({ id: 1, assignees: [{ id: "u1", name: "Me" }] });
  const theirs = ev({ id: 2, assignees: [{ id: "u2", name: "Other" }] });
  const later = ev({ id: 3, startTime: "06:00", assignees: [{ id: "u1", name: "Me" }] });

  it("day + mine → one section, only my events, sorted by start", () => {
    const out = buildAgendaSections([mine, theirs, later], {
      focusedDate: "2026-06-08", range: "day", scope: "mine",
      currentUserId: "u1", today: "2026-06-08",
    });
    expect(out).toHaveLength(1);
    expect(out[0].isToday).toBe(true);
    expect(out[0].events.map((e) => e.id)).toEqual([3, 1]); // 06:00 before 08:00
  });

  it("team → includes everyone", () => {
    const out = buildAgendaSections([mine, theirs], {
      focusedDate: "2026-06-08", range: "day", scope: "team",
      currentUserId: "u1", today: "2026-06-09",
    });
    expect(out[0].events).toHaveLength(2);
    expect(out[0].isToday).toBe(false);
  });

  it("week → seven sections", () => {
    const out = buildAgendaSections([mine], {
      focusedDate: "2026-06-08", range: "week", scope: "mine",
      currentUserId: "u1", today: "2026-06-08",
    });
    expect(out).toHaveLength(7);
    expect(out[0].events).toHaveLength(1);
    expect(out[1].events).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/schedule/agenda.test.ts`
Expected: FAIL — `Cannot find module '@/lib/schedule/agenda'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/schedule/agenda.ts`:

```ts
import { addDays, dateStr, getWeekStart } from "@/lib/utils";

export type Scope = "mine" | "team";
export type Range = "day" | "week";

export interface AgendaEvent {
  id: number;
  type: string;
  title: string;
  startTime: string;
  endTime: string;
  date: string; // ISO datetime or YYYY-MM-DD
  endDate?: string | null;
  assignees: { id: string; name: string }[];
}

export interface AgendaSection {
  date: string; // YYYY-MM-DD
  label: string;
  isToday: boolean;
  events: AgendaEvent[];
}

/** A YYYY-MM-DD local Date anchored at noon to avoid TZ/DST edge slips. */
function noon(day: string): Date {
  return new Date(`${day.slice(0, 10)}T12:00:00`);
}

/** "08:00" → "8:00a", "13:05" → "1:05p", "00:00" → "12:00a". */
export function formatClock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")}${am ? "a" : "p"}`;
}

/** Inclusive day-span test. YYYY-MM-DD strings compare lexicographically. */
export function eventOccursOn(
  ev: { date: string; endDate?: string | null },
  day: string
): boolean {
  const start = ev.date.slice(0, 10);
  const end = ev.endDate ? ev.endDate.slice(0, 10) : start;
  return day >= start && day <= end;
}

/** Mon..Sun (YYYY-MM-DD) of the week containing `focused`. */
export function weekDates(focused: string): string[] {
  const start = getWeekStart(noon(focused));
  return Array.from({ length: 7 }, (_, i) => dateStr(addDays(start, i)));
}

export function sectionDates(focused: string, range: Range): string[] {
  return range === "day" ? [focused.slice(0, 10)] : weekDates(focused);
}

export function shiftFocus(focused: string, range: Range, dir: 1 | -1): string {
  return dateStr(addDays(noon(focused), range === "week" ? 7 * dir : dir));
}

export function formatSectionLabel(day: string): string {
  const d = noon(day);
  const wd = d.toLocaleDateString("en-US", { weekday: "short" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${wd} · ${md}`;
}

export function buildAgendaSections(
  events: AgendaEvent[],
  opts: {
    focusedDate: string;
    range: Range;
    scope: Scope;
    currentUserId: string;
    today: string;
  }
): AgendaSection[] {
  const scoped =
    opts.scope === "mine"
      ? events.filter((e) =>
          e.assignees.some((a) => a.id === opts.currentUserId)
        )
      : events;

  return sectionDates(opts.focusedDate, opts.range).map((day) => ({
    date: day,
    label: formatSectionLabel(day),
    isToday: day === opts.today,
    events: scoped
      .filter((e) => eventOccursOn(e, day))
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/schedule/agenda.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/schedule/agenda.ts __tests__/lib/schedule/agenda.test.ts
git commit -m "feat(schedule): pure agenda sectioning + date helpers"
```

---

## Task 2: Address resolver (pure)

**Files:**
- Create: `lib/events/serialize.ts`
- Test: `__tests__/lib/events/serialize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/events/serialize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveEventAddress } from "@/lib/events/serialize";

describe("resolveEventAddress", () => {
  it("prefers the estimate's site-measure location address", () => {
    expect(
      resolveEventAddress({
        estimate: { estimateNumber: 5, siteMeasure: { location: { address: "412 Oak St" } } },
        customer: { id: 1, name: "C", phone: null, locations: [{ address: "999 Other" }] },
      })
    ).toBe("412 Oak St");
  });

  it("falls back to the customer's first location", () => {
    expect(
      resolveEventAddress({
        estimate: null,
        customer: { id: 1, name: "C", phone: null, locations: [{ address: "88 Birch Ave" }] },
      })
    ).toBe("88 Birch Ave");
  });

  it("returns null when nothing is derivable", () => {
    expect(
      resolveEventAddress({ estimate: null, customer: { id: 1, name: "C", phone: null, locations: [] } })
    ).toBeNull();
  });

  it("ignores blank/whitespace addresses", () => {
    expect(
      resolveEventAddress({
        estimate: { estimateNumber: 5, siteMeasure: { location: { address: "   " } } },
        customer: { id: 1, name: "C", phone: null, locations: [{ address: "88 Birch Ave" }] },
      })
    ).toBe("88 Birch Ave");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/lib/events/serialize.test.ts`
Expected: FAIL — `Cannot find module '@/lib/events/serialize'`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/events/serialize.ts`:

```ts
export interface EventLocationSource {
  estimate?: {
    estimateNumber: number;
    siteMeasure?: { location?: { address: string | null } | null } | null;
  } | null;
  customer?: {
    id: number;
    name: string;
    phone: string | null;
    locations?: { address: string | null }[];
  } | null;
}

/** First non-blank of: estimate's site-measure location, then customer's first location. */
export function resolveEventAddress(e: EventLocationSource): string | null {
  const fromEstimate = e.estimate?.siteMeasure?.location?.address?.trim();
  if (fromEstimate) return fromEstimate;
  const fromCustomer = e.customer?.locations?.[0]?.address?.trim();
  if (fromCustomer) return fromCustomer;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/lib/events/serialize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/events/serialize.ts __tests__/lib/events/serialize.test.ts
git commit -m "feat(events): pure address resolver for agenda payload"
```

---

## Task 3: Extend the events payload (repo + CalEvent type)

**Files:**
- Modify: `lib/repositories/eventRepo.ts`
- Modify: `lib/hooks/useEvents.ts`

> No new business logic beyond Task 2's resolver, so this task is verified by `npm run typecheck`, the existing `CalendarGrid` test (must stay green), and the resolver test. DB-backed integration is gated on `VITEST_DB_AVAILABLE` per repo convention and is out of scope here.

- [ ] **Step 1: Add a detailed include + map in `listEvents`**

In `lib/repositories/eventRepo.ts`, add the import at the top:

```ts
import { resolveEventAddress } from "@/lib/events/serialize";
```

Add a new include constant below the existing `includeRelations` (leave `includeRelations` and `createEvent`/`updateEvent` unchanged):

```ts
const listInclude = {
  assignees: {
    select: { id: true, name: true, title: true },
    orderBy: { name: "asc" as const },
  },
  customer: {
    select: {
      id: true,
      name: true,
      phone: true,
      locations: { select: { address: true }, orderBy: { id: "asc" as const }, take: 1 },
    },
  },
  estimate: {
    select: {
      estimateNumber: true,
      siteMeasure: { select: { location: { select: { address: true } } } },
    },
  },
} satisfies Prisma.EventInclude;
```

Replace the body of `listEvents` with:

```ts
export async function listEvents(orgId: string) {
  const events = await prisma.event.findMany({
    where: { orgId },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: listInclude,
  });

  return events.map((e) => ({
    id: e.id,
    orgId: e.orgId,
    type: e.type,
    title: e.title,
    customerId: e.customerId,
    estimateId: e.estimateId,
    date: e.date,
    endDate: e.endDate,
    startTime: e.startTime,
    endTime: e.endTime,
    notes: e.notes,
    createdAt: e.createdAt,
    assignees: e.assignees,
    customer: e.customer
      ? { id: e.customer.id, name: e.customer.name, phone: e.customer.phone }
      : null,
    estimateNumber: e.estimate?.estimateNumber ?? null,
    address: resolveEventAddress(e),
  }));
}
```

> Note: the old `EventWithRelations` type and `includeRelations` const remain for `createEvent`/`updateEvent`. If `EventWithRelations` becomes unused after this change, leave it — it documents the create/update shape.

- [ ] **Step 2: Extend the `CalEvent` type**

In `lib/hooks/useEvents.ts`, update the `CalEvent` interface. Change the `customer` line and add two fields:

```ts
  customer?: { id: number; name: string; phone?: string | null } | null;
  estimateNumber?: number | null;
  address?: string | null;
```

(Keep all other `CalEvent` fields as-is. The new fields are optional so existing fixtures/mutations remain valid.)

- [ ] **Step 3: Typecheck + existing tests still pass**

Run: `npm run typecheck`
Expected: no errors.

Run: `npx vitest run __tests__/components/schedule/CalendarGrid.test.tsx`
Expected: PASS (grid ignores the new fields).

- [ ] **Step 4: Commit**

```bash
git add lib/repositories/eventRepo.ts lib/hooks/useEvents.ts
git commit -m "feat(events): include derived address + phone in events list payload"
```

---

## Task 4: Event-type metadata + EventCard

**Files:**
- Create: `components/schedule/eventMeta.ts`
- Create: `components/schedule/EventCard.tsx`
- Test: `__tests__/components/schedule/EventCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/schedule/EventCard.test.tsx`:

```tsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventCard } from "@/components/schedule/EventCard";
import type { CalEvent } from "@/lib/hooks/useEvents";

const base: CalEvent = {
  id: 7,
  orgId: "o1",
  type: "job",
  title: "Carpet — hall & stairs",
  customerId: 3,
  estimateId: 9,
  estimateNumber: 1042,
  date: "2026-06-08T00:00:00.000Z",
  endDate: null,
  startTime: "08:00",
  endTime: "11:00",
  assignees: [{ id: "u1", name: "Jordan" }],
  notes: null,
  createdAt: "2026-06-08T00:00:00.000Z",
  customer: { id: 3, name: "Johnson Residence", phone: "2175550148" },
  address: "412 Oak St",
};

describe("EventCard", () => {
  it("shows time, title, customer, address and crew initial", () => {
    render(<EventCard event={base} onOpen={() => {}} />);
    expect(screen.getByText("8:00a")).toBeInTheDocument();
    expect(screen.getByText("Carpet — hall & stairs")).toBeInTheDocument();
    expect(screen.getByText("Johnson Residence")).toBeInTheDocument();
    expect(screen.getByText("412 Oak St")).toBeInTheDocument();
    expect(screen.getByText("J")).toBeInTheDocument(); // CrewAvatar initial
  });

  it("calls onOpen when tapped", () => {
    const onOpen = vi.fn();
    render(<EventCard event={base} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith(base);
  });

  it("omits the address row when none is derivable", () => {
    render(<EventCard event={{ ...base, address: null }} onOpen={() => {}} />);
    expect(screen.queryByText("412 Oak St")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/schedule/EventCard.test.tsx`
Expected: FAIL — cannot find `@/components/schedule/EventCard`.

- [ ] **Step 3: Write the metadata + card**

Create `components/schedule/eventMeta.ts`:

```ts
export const EVENT_ACCENT: Record<string, string> = {
  job: "bg-[var(--accent)]",
  visit: "bg-[var(--gold)]",
  other: "bg-[var(--sage)]",
};

export const EVENT_LABEL: Record<string, string> = {
  job: "Job",
  visit: "Visit",
  other: "Other",
};

export function eventAccent(type: string): string {
  return EVENT_ACCENT[type] ?? EVENT_ACCENT.other;
}

export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? "Other";
}
```

Create `components/schedule/EventCard.tsx`:

```tsx
"use client";

import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { cn } from "@/lib/cn";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { eventAccent, eventLabel } from "@/components/schedule/eventMeta";
import { formatClock } from "@/lib/schedule/agenda";

export function EventCard({
  event,
  onOpen,
}: {
  event: CalEvent;
  onOpen: (event: CalEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={cn(
        "w-full flex gap-2.5 text-left",
        "bg-[var(--surface)] border border-[var(--line)] rounded-xl p-3 mb-2.5",
        "transition-colors hover:border-[var(--accent)]"
      )}
    >
      <div className="w-[46px] shrink-0 text-[12px] font-[700] leading-tight">
        {formatClock(event.startTime)}
        <span className="block font-[500] text-[var(--muted)] text-[11px]">
          –{formatClock(event.endTime)}
        </span>
      </div>
      <div className={cn("w-1 rounded shrink-0", eventAccent(event.type))} />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-[600] truncate">{event.title}</div>
        <div className="text-[11.5px] text-[var(--ink-2)] mt-0.5 flex items-center gap-1.5">
          <span className="text-[9px] font-[700] uppercase px-1.5 py-0.5 rounded bg-[var(--surface-2)]">
            {eventLabel(event.type)}
          </span>
          {event.customer?.name ?? ""}
        </div>
        {event.address ? (
          <div className="text-[11.5px] text-[var(--muted)] mt-0.5 truncate">
            📍 {event.address}
          </div>
        ) : null}
        {event.assignees.length > 0 ? (
          <div className="flex mt-1.5 gap-1">
            {event.assignees.map((a) => (
              <CrewAvatar key={a.id} name={a.name} size="lg" />
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/schedule/EventCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/schedule/eventMeta.ts components/schedule/EventCard.tsx __tests__/components/schedule/EventCard.test.tsx
git commit -m "feat(schedule): EventCard + event-type metadata"
```

---

## Task 5: JobCard detail sheet

**Files:**
- Create: `components/schedule/JobCard.tsx`
- Test: `__tests__/components/schedule/JobCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/schedule/JobCard.test.tsx`:

```tsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobCard } from "@/components/schedule/JobCard";
import type { CalEvent } from "@/lib/hooks/useEvents";

const event: CalEvent = {
  id: 7,
  orgId: "o1",
  type: "job",
  title: "Carpet — hall & stairs",
  customerId: 3,
  estimateId: 9,
  estimateNumber: 1042,
  date: "2026-06-08T00:00:00.000Z",
  endDate: null,
  startTime: "08:00",
  endTime: "11:00",
  assignees: [{ id: "u1", name: "Jordan" }],
  notes: "Gate code #4412",
  createdAt: "2026-06-08T00:00:00.000Z",
  customer: { id: 3, name: "Johnson Residence", phone: "2175550148" },
  address: "412 Oak St",
};

describe("JobCard", () => {
  it("renders nothing when event is null", () => {
    const { container } = render(<JobCard event={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows details and actionable links", () => {
    render(<JobCard event={event} onClose={() => {}} />);
    expect(screen.getByText("Carpet — hall & stairs")).toBeInTheDocument();
    expect(screen.getByText("Johnson Residence")).toBeInTheDocument();
    expect(screen.getByText("Gate code #4412")).toBeInTheDocument();

    const phone = screen.getByRole("link", { name: /call/i });
    expect(phone).toHaveAttribute("href", "tel:2175550148");

    const directions = screen.getByRole("link", { name: /directions/i });
    expect(directions).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=412%20Oak%20St"
    );

    expect(screen.getByRole("link", { name: /view customer/i })).toHaveAttribute(
      "href",
      "/customers/3"
    );
    expect(screen.getByRole("link", { name: /view estimate/i })).toHaveAttribute(
      "href",
      "/estimates/9"
    );
  });

  it("calls onClose from the close button", () => {
    const onClose = vi.fn();
    render(<JobCard event={event} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/schedule/JobCard.test.tsx`
Expected: FAIL — cannot find `@/components/schedule/JobCard`.

- [ ] **Step 3: Write the bottom-sheet component**

Create `components/schedule/JobCard.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { CrewAvatar } from "@/components/ui/CrewAvatar";
import { cn } from "@/lib/cn";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { eventAccent, eventLabel } from "@/components/schedule/eventMeta";
import { formatClock, formatSectionLabel } from "@/lib/schedule/agenda";

function mapsHref(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function JobCard({
  event,
  onClose,
}: {
  event: CalEvent | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [event, onClose]);

  if (!event) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        className={cn(
          "relative w-full sm:max-w-[480px] bg-[var(--paper)]",
          "rounded-t-2xl shadow-2xl p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))]",
          "max-h-[90vh] overflow-auto"
        )}
      >
        <div className="flex items-start gap-2.5">
          <div className={cn("w-1.5 self-stretch rounded", eventAccent(event.type))} />
          <div className="flex-1 min-w-0">
            <span className="text-[9.5px] font-[700] uppercase px-1.5 py-0.5 rounded bg-[var(--surface-2)]">
              {eventLabel(event.type)}
            </span>
            <h2 className="text-[18px] font-[700] mt-1.5">{event.title}</h2>
            <div className="text-[12.5px] text-[var(--ink-2)]">
              {formatSectionLabel(event.date.slice(0, 10))} ·{" "}
              {formatClock(event.startTime)} – {formatClock(event.endTime)}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 rounded-full bg-[var(--surface-2)] text-[var(--ink-2)] flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {event.customer ? (
          <div className="mt-4 pt-3 border-t border-[var(--line)] flex items-center gap-2.5">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-[600] text-[var(--muted)]">Customer</div>
              <div className="text-[13.5px] font-[600] truncate">{event.customer.name}</div>
            </div>
          </div>
        ) : null}

        {event.address ? (
          <a
            href={mapsHref(event.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 pt-3 border-t border-[var(--line)] flex items-center gap-2.5"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-[600] text-[var(--muted)]">Address</div>
              <div className="text-[13.5px] font-[600] truncate">{event.address}</div>
            </div>
            <span className="text-[11px] font-[700] text-[var(--accent)]">Directions ›</span>
          </a>
        ) : null}

        {event.customer?.phone ? (
          <a
            href={`tel:${event.customer.phone}`}
            className="mt-1 pt-3 border-t border-[var(--line)] flex items-center gap-2.5"
          >
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase font-[600] text-[var(--muted)]">Contact</div>
              <div className="text-[13.5px] font-[600]">{event.customer.phone}</div>
            </div>
            <span className="text-[11px] font-[700] text-[var(--accent)]">Call</span>
          </a>
        ) : null}

        {event.assignees.length > 0 ? (
          <div className="mt-1 pt-3 border-t border-[var(--line)]">
            <div className="text-[10px] uppercase font-[600] text-[var(--muted)]">Crew</div>
            <div className="flex items-center gap-1.5 mt-1">
              {event.assignees.map((a) => (
                <span key={a.id} className="flex items-center gap-1 text-[12.5px]">
                  <CrewAvatar name={a.name} size="lg" /> {a.name}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {event.notes ? (
          <div className="mt-1 pt-3 border-t border-[var(--line)]">
            <div className="text-[10px] uppercase font-[600] text-[var(--muted)]">Notes</div>
            <div className="text-[12.5px] mt-0.5 whitespace-pre-wrap">{event.notes}</div>
          </div>
        ) : null}

        <div className="flex gap-2.5 mt-4">
          {event.customerId ? (
            <Link
              href={`/customers/${event.customerId}`}
              className="flex-1 text-center py-2.5 rounded-xl bg-[var(--surface-2)] text-[13px] font-[700]"
            >
              View customer
            </Link>
          ) : null}
          {event.estimateId ? (
            <Link
              href={`/estimates/${event.estimateId}`}
              className="flex-1 text-center py-2.5 rounded-xl bg-[var(--ink)] text-[var(--paper)] text-[13px] font-[700]"
            >
              View estimate
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/schedule/JobCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/schedule/JobCard.tsx __tests__/components/schedule/JobCard.test.tsx
git commit -m "feat(schedule): JobCard detail bottom sheet"
```

---

## Task 6: DayAgenda renderer

**Files:**
- Create: `components/schedule/DayAgenda.tsx`

> Rendered indirectly through Task 7's `MyScheduleView` test; this task has no standalone test file (it's a thin presentational map). Verified by typecheck + Task 7.

- [ ] **Step 1: Write the component**

Create `components/schedule/DayAgenda.tsx`:

```tsx
"use client";

import { EventCard } from "@/components/schedule/EventCard";
import { cn } from "@/lib/cn";
import type { CalEvent } from "@/lib/hooks/useEvents";
import type { AgendaSection } from "@/lib/schedule/agenda";

export function DayAgenda({
  sections,
  onOpenEvent,
}: {
  sections: AgendaSection[];
  onOpenEvent: (event: CalEvent) => void;
}) {
  return (
    <div className="px-3 pt-1 max-w-[680px] mx-auto w-full">
      {sections.map((section) => (
        <section key={section.date}>
          <h2
            className={cn(
              "text-[13px] font-[700] pt-2.5 pb-1.5",
              section.isToday && "text-[var(--accent)]"
            )}
          >
            {section.label}
          </h2>
          {section.events.length > 0 ? (
            section.events.map((e) => (
              <EventCard key={e.id} event={e as CalEvent} onOpen={onOpenEvent} />
            ))
          ) : (
            <p className="text-[11.5px] text-[var(--muted)] italic pb-2">No jobs</p>
          )}
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/schedule/DayAgenda.tsx
git commit -m "feat(schedule): DayAgenda section renderer"
```

---

## Task 7: MyScheduleView (client view + toggles + nav)

**Files:**
- Create: `components/schedule/MyScheduleView.tsx`
- Test: `__tests__/components/schedule/MyScheduleView.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/schedule/MyScheduleView.test.tsx`:

```tsx
// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { MyScheduleView } from "@/components/schedule/MyScheduleView";
import type { CalEvent } from "@/lib/hooks/useEvents";
import { todayStr } from "@/lib/utils";

const today = todayStr();

const mine: CalEvent = {
  id: 1, orgId: "o1", type: "job", title: "My Carpet Job",
  customerId: 3, estimateId: 9, estimateNumber: 1042,
  date: `${today}T00:00:00.000Z`, endDate: null,
  startTime: "08:00", endTime: "11:00",
  assignees: [{ id: "u1", name: "Me" }],
  notes: null, createdAt: today,
  customer: { id: 3, name: "Johnson", phone: "2175550148" },
  address: "412 Oak St",
};
const theirs: CalEvent = {
  ...mine, id: 2, title: "Other's Job",
  assignees: [{ id: "u2", name: "Other" }],
  customer: { id: 4, name: "Alvarez", phone: null }, address: null,
};

vi.mock("@/lib/hooks/useEvents", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/hooks/useEvents")>();
  return { ...actual, useEvents: () => ({ data: [mine, theirs] }) };
});

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("MyScheduleView", () => {
  it("defaults to My + Day + today and shows only my events", async () => {
    render(wrap(<MyScheduleView currentUserId="u1" />));
    await waitFor(() => expect(screen.getByText("My Carpet Job")).toBeInTheDocument());
    expect(screen.queryByText("Other's Job")).not.toBeInTheDocument();
  });

  it("Team scope reveals everyone's events", async () => {
    render(wrap(<MyScheduleView currentUserId="u1" />));
    await waitFor(() => screen.getByText("My Carpet Job"));
    fireEvent.click(screen.getByRole("button", { name: "Team" }));
    expect(await screen.findByText("Other's Job")).toBeInTheDocument();
  });

  it("tapping an event opens the job card", async () => {
    render(wrap(<MyScheduleView currentUserId="u1" />));
    await waitFor(() => screen.getByText("My Carpet Job"));
    fireEvent.click(screen.getByText("My Carpet Job"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view estimate/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run __tests__/components/schedule/MyScheduleView.test.tsx`
Expected: FAIL — cannot find `@/components/schedule/MyScheduleView`.

- [ ] **Step 3: Write the view**

Create `components/schedule/MyScheduleView.tsx`:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { DayAgenda } from "@/components/schedule/DayAgenda";
import { JobCard } from "@/components/schedule/JobCard";
import { cn } from "@/lib/cn";
import { type CalEvent, useEvents } from "@/lib/hooks/useEvents";
import {
  type Range,
  type Scope,
  buildAgendaSections,
  shiftFocus,
} from "@/lib/schedule/agenda";
import { todayStr } from "@/lib/utils";

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex-1 flex bg-[var(--surface-2)] rounded-lg p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 text-center text-[11px] font-[600] py-1.5 rounded-md transition-colors",
            value === o.value
              ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
              : "text-[var(--muted)]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MyScheduleView({ currentUserId }: { currentUserId: string }) {
  const [scope, setScope] = useState<Scope>("mine");
  const [range, setRange] = useState<Range>("day");
  // Set after mount so "today" is the device's local day (avoids SSR mismatch).
  const [focusedDate, setFocusedDate] = useState<string>("");
  const [today, setToday] = useState<string>("");
  const [selected, setSelected] = useState<CalEvent | null>(null);

  useEffect(() => {
    const t = todayStr();
    setToday(t);
    setFocusedDate(t);
  }, []);

  const { data: events = [] } = useEvents();

  const sections = useMemo(() => {
    if (!focusedDate) return [];
    return buildAgendaSections(events, {
      focusedDate,
      range,
      scope,
      currentUserId,
      today,
    });
  }, [events, focusedDate, range, scope, currentUserId, today]);

  if (!focusedDate) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="bg-[var(--surface)] border-b border-[var(--line)] px-3 pt-2.5 pb-2 max-w-[680px] mx-auto w-full">
        <div className="flex gap-1.5">
          <Segmented
            options={[
              { value: "mine", label: "My" },
              { value: "team", label: "Team" },
            ]}
            value={scope}
            onChange={setScope}
          />
          <Segmented
            options={[
              { value: "day", label: "Day" },
              { value: "week", label: "Week" },
            ]}
            value={range}
            onChange={setRange}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => setFocusedDate((d) => shiftFocus(d, range, -1))}
            className="w-7 h-7 rounded-lg bg-[var(--surface-2)] flex items-center justify-center"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setFocusedDate(today)}
            className="text-[11px] font-[700] text-[var(--accent)]"
          >
            ● Today
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => setFocusedDate((d) => shiftFocus(d, range, 1))}
            className="w-7 h-7 rounded-lg bg-[var(--surface-2)] flex items-center justify-center"
          >
            ›
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <DayAgenda sections={sections} onOpenEvent={setSelected} />
      </div>

      <JobCard event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run __tests__/components/schedule/MyScheduleView.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Commit**

```bash
git add components/schedule/MyScheduleView.tsx __tests__/components/schedule/MyScheduleView.test.tsx
git commit -m "feat(schedule): MyScheduleView with scope/range toggles + day nav"
```

---

## Task 8: Server page route

**Files:**
- Create: `app/(app)/my-schedule/page.tsx`

- [ ] **Step 1: Write the page**

Create `app/(app)/my-schedule/page.tsx`:

```tsx
import { MyScheduleView } from "@/components/schedule/MyScheduleView";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "My Schedule - SqFt" };

export default async function MySchedulePage() {
  const session = await requireSession();
  return <MyScheduleView currentUserId={session.user.id} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (`session.user.id` is typed via `lib/auth.ts`).

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/my-schedule/page.tsx"
git commit -m "feat(schedule): /my-schedule page shell"
```

---

## Task 9: Nav integration

**Files:**
- Modify: `components/ui/AppNav.tsx`

> No unit test (nav is visual/structural). Verified by typecheck, lint, and a manual `npm run dev` smoke check that the tab appears and routes.

- [ ] **Step 1: Add the nav tab**

In `components/ui/AppNav.tsx`, add an entry to `NAV_TABS` immediately before the `/schedule` line:

```ts
  { href: "/my-schedule", label: "My Schedule", screen: "my-schedule" },
  { href: "/schedule", label: "Schedule", screen: "schedule" },
```

- [ ] **Step 2: Let crew see it**

Replace `navTabsFor` with:

```ts
function navTabsFor(role: string) {
  if (role === "crew") {
    return NAV_TABS.filter(
      (t) => t.href === "/my-schedule" || t.href === "/schedule"
    );
  }
  return NAV_TABS;
}
```

- [ ] **Step 3: Make the mobile grid handle any tab count**

Replace the mobile bottom-nav grid container `<div>` (the one with `grid gap-0.5 max-w-[640px]`) with:

```tsx
        <div
          className={cn(
            "grid gap-0.5 max-w-[680px] mx-auto",
            tabs.length === 1 && "justify-center"
          )}
          style={{
            gridTemplateColumns:
              tabs.length > 1
                ? `repeat(${tabs.length}, minmax(0, 1fr))`
                : undefined,
          }}
        >
```

- [ ] **Step 4: Add a nav icon for "My Schedule"**

In the `icons` record inside `NavIcon`, add this entry (alongside the existing `Schedule` entry):

```tsx
    "My Schedule": (
      <svg {...props}>
        <title>{label}</title>
        <rect x="4" y="5" width="16" height="15" rx="1.5" />
        <path d="M4 9h16M9 3v4M15 3v4" />
        <path d="M9 14l2 2 3.5-3.8" />
      </svg>
    ),
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck`
Expected: no errors.

Run: `npx biome ci components/ui/AppNav.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/ui/AppNav.tsx
git commit -m "feat(nav): add My Schedule tab (crew-visible) + flexible mobile grid"
```

---

## Task 10: Docs + full verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `CONTEXT.md`

- [ ] **Step 1: Update `AGENTS.md`**

In the `app/(app)/` bullet under "Where things live", add `my-schedule` to the schedule domain description. Add a one-line note after the schedule sentence:

```
  The read-only, mobile-first **My Schedule** day view (`app/(app)/my-schedule`,
  `components/schedule/MyScheduleView` + `EventCard`/`JobCard`/`DayAgenda`, pure
  logic in `lib/schedule/agenda.ts`) lives alongside the editable `/schedule`
  grid; both read `useEvents`.
```

- [ ] **Step 2: Update `CONTEXT.md`**

Add a short entry to the schedule/Event section noting the new read-only personal/team day view and that the events list payload now carries a derived `address` + `customer.phone` (resolver in `lib/events/serialize.ts`). Edit the existing section; do not append a stray block.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: PASS (new suites + all existing).

- [ ] **Step 4: Lint (must pass before commit)**

Run: `npm run lint:ci`
Expected: no errors. If any, run `npm run lint:fix` and re-run.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md CONTEXT.md
git commit -m "docs(schedule): document My Schedule day view + enriched events payload"
```

---

## Self-Review

**Spec coverage:**
- Read-only day view, opens on device's current day → Task 7 (`useEffect` sets `focusedDate = todayStr()`), Task 1 (`today` comparison). ✅
- ‹ Today › nav, day/week stepping → Task 7 (`shiftFocus`). ✅
- One list, four filters (My/Team × Day/Week) → Task 1 (`buildAgendaSections`), Task 7 (toggles). ✅
- Section header = just the date → Task 6 (`section.label` from `formatSectionLabel`). ✅
- Identical card incl. address + avatars → Task 4. ✅
- Tap → job card with customer/directions/call/notes/estimate links → Task 5. ✅
- Address derivation (estimate location → customer location) + phone in payload → Tasks 2 & 3. ✅
- Separate `/my-schedule` page, grid untouched → Task 8; `createEvent`/`updateEvent` left unchanged in Task 3. ✅
- Team visible to everyone → Task 7 (no role gate on the Team toggle); crew sees the page → Task 9. ✅
- Same centered list on desktop → `max-w-[680px] mx-auto` in Tasks 6 & 7. ✅
- Empty-day state → Task 6 ("No jobs"). ✅
- Tests (section computation, scope filter, multi-day, address precedence, component behaviors) → Tasks 1,2,4,5,7. ✅

**Placeholder scan:** No TBD/TODO; every code step has full code and exact commands. ✅

**Type consistency:**
- `CalEvent` extended with optional `address`, `estimateNumber`, `customer.phone` (Task 3) — used consistently in Tasks 4,5,7 fixtures and components. ✅
- `AgendaEvent`/`AgendaSection`/`Scope`/`Range` defined in Task 1, consumed in Tasks 6,7. `CalEvent` is assignable to `AgendaEvent` (superset of its fields); `DayAgenda` casts `e as CalEvent` for `EventCard`. ✅
- `buildAgendaSections`, `shiftFocus`, `formatClock`, `formatSectionLabel`, `eventAccent`, `eventLabel`, `resolveEventAddress` — names match across definition and use. ✅
- `MyScheduleView` prop `currentUserId: string` matches the page passing `session.user.id` (Task 8). ✅

**Note for implementer:** `lib/schedule/agenda.ts` imports `getWeekStart`/`addDays`/`dateStr` from `lib/utils.ts` (verified to exist). The maps URL format mirrors `components/customers/LocationsCard.tsx`. Event dates arrive as ISO strings over the wire; `.slice(0,10)` yields the local `YYYY-MM-DD` (matching the existing grid's handling).
