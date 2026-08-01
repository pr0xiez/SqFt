import { describe, expect, it } from "vitest";
import { isPersistableQueryKey } from "@/lib/queryCache";

describe("isPersistableQueryKey", () => {
  it("keeps the Stripe connect status out of localStorage", () => {
    // Its payload carries Stripe's identity-verification failure text — the
    // reason a person's ID or tax id was rejected. The persisted cache has a
    // 24-hour maxAge and survives sign-out, so this one must never be written.
    expect(isPersistableQueryKey(["stripe-connect"])).toBe(false);
  });

  it("persists ordinary queries", () => {
    expect(isPersistableQueryKey(["invoices"])).toBe(true);
    expect(isPersistableQueryKey(["estimates", 1])).toBe(true);
  });
});
