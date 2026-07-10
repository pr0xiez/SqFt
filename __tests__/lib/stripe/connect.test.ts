import { describe, expect, it } from "vitest";
import {
  aggregateConnectStatus,
  mapCapabilityStatus,
} from "@/lib/stripe/connect";

describe("mapCapabilityStatus", () => {
  it("maps active to active", () => {
    expect(mapCapabilityStatus("active")).toBe("active");
  });
  it("maps unrequested/pending/inactive/unsupported to pending", () => {
    expect(mapCapabilityStatus("pending")).toBe("pending");
    expect(mapCapabilityStatus("unrequested")).toBe("pending");
    // 'unsupported' (capability unavailable for the account) maps to pending:
    // the account can't process payments, same as not-yet-approved.
    expect(mapCapabilityStatus("unsupported")).toBe("pending");
    expect(mapCapabilityStatus(undefined)).toBe("pending");
  });
  it("maps restricted/disabled to restricted", () => {
    expect(mapCapabilityStatus("restricted")).toBe("restricted");
    expect(mapCapabilityStatus("disabled")).toBe("restricted");
  });
});

describe("aggregateConnectStatus", () => {
  it("is active when EITHER capability is active", () => {
    // Checkout offers dynamic payment methods, so the account can take payment —
    // and the Pay button should show — as soon as one capability is live. Gating
    // on card_payments alone would hide the button from an ACH-active account.
    expect(aggregateConnectStatus("active", "restricted")).toBe("active");
    expect(aggregateConnectStatus("pending", "active")).toBe("active");
    expect(aggregateConnectStatus("active", "active")).toBe("active");
  });
  it("is restricted when neither is active but one is restricted", () => {
    expect(aggregateConnectStatus("restricted", "pending")).toBe("restricted");
    expect(aggregateConnectStatus("pending", "restricted")).toBe("restricted");
  });
  it("is pending only when neither capability is usable", () => {
    expect(aggregateConnectStatus("pending", "pending")).toBe("pending");
  });
});
