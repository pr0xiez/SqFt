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
