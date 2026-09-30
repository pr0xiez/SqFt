import { describe, expect, it } from "vitest";
import { isPersistableQueryKey } from "@/lib/queryCache";

describe("isPersistableQueryKey", () => {
  it("keeps the Stripe connect status out of localStorage", () => {
    // Its payload carries Stripe's identity-verification failure text — the
    // reason a person's ID or tax id was rejected. The persisted cache has a
    // 24-hour maxAge and survives sign-out, so this one must never be written.
    expect(isPersistableQueryKey(["stripe-connect"])).toBe(false);
  });

  it("keeps invoice data out of localStorage", () => {
    // Payment ledger data (amounts owed/paid, line items) — must not outlive
    // the session on a shared machine.
    expect(isPersistableQueryKey(["invoices"])).toBe(false);
    expect(isPersistableQueryKey(["invoices", "list", {}])).toBe(false);
    expect(isPersistableQueryKey(["invoices", 1])).toBe(false);
  });

  it("keeps customer PII out of localStorage", () => {
    // Name/phone/email — must not outlive the session on a shared machine.
    expect(isPersistableQueryKey(["customers"])).toBe(false);
    expect(isPersistableQueryKey(["customers", { q: "smith" }])).toBe(false);
  });

  it("keeps the org member roster out of localStorage", () => {
    // Names, emails, and roles of org members — must not outlive the session
    // on a shared machine.
    expect(isPersistableQueryKey(["users"])).toBe(false);
    expect(isPersistableQueryKey(["users", "assignable"])).toBe(false);
  });

  it.each([
    "estimates",
    "siteMeasures",
    "locations",
    "events",
    "admin",
    "admin-orgs",
    "admin-org-members",
    "qbo-status",
  ])("keeps nested PII under %s out of localStorage", (key) => {
    expect(isPersistableQueryKey([key, 1])).toBe(false);
    expect(isPersistableQueryKey([key, "list", {}])).toBe(false);
  });

  it("does not persist new or malformed query families by default", () => {
    expect(isPersistableQueryKey(["new-financial-report"])).toBe(false);
    expect(isPersistableQueryKey([])).toBe(false);
    expect(isPersistableQueryKey(["org"])).toBe(false);
  });

  it("persists configuration queries", () => {
    expect(isPersistableQueryKey(["line-item-templates"])).toBe(true);
  });
});
