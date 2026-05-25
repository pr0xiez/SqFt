import { describe, expect, it } from "vitest";
import { hasMinRole, homePathFor, ROLE_RANK } from "@/lib/auth/permissions";

describe("ROLE_RANK", () => {
  it("orders crew < lead < admin", () => {
    expect(ROLE_RANK.crew).toBe(0);
    expect(ROLE_RANK.lead).toBe(1);
    expect(ROLE_RANK.admin).toBe(2);
  });
});

describe("hasMinRole", () => {
  it.each([
    ["admin", "admin", true],
    ["admin", "lead", true],
    ["admin", "crew", true],
    ["lead", "admin", false],
    ["lead", "lead", true],
    ["lead", "crew", true],
    ["crew", "admin", false],
    ["crew", "lead", false],
    ["crew", "crew", true],
  ] as const)("(%s, %s) → %s", (role, min, expected) => {
    expect(hasMinRole(role, min)).toBe(expected);
  });

  it("returns false for an unknown role", () => {
    expect(hasMinRole("owner", "crew")).toBe(false);
    expect(hasMinRole("", "admin")).toBe(false);
  });
});

describe("homePathFor", () => {
  it("sends crew to /schedule", () => {
    expect(homePathFor("crew")).toBe("/schedule");
  });
  it("sends lead and admin to /", () => {
    expect(homePathFor("lead")).toBe("/");
    expect(homePathFor("admin")).toBe("/");
  });
  it("sends unknown roles to /", () => {
    expect(homePathFor("owner")).toBe("/");
  });
});
