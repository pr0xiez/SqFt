import { describe, expect, it } from "vitest";
import {
  aggregateConnectStatus,
  mapCapabilityStatus,
  summarizeRequirements,
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

describe("summarizeRequirements", () => {
  it("reports nothing outstanding for no entries", () => {
    expect(summarizeRequirements(undefined)).toEqual({
      actionDue: false,
      inReview: false,
      errorReason: null,
    });
    expect(summarizeRequirements([])).toEqual({
      actionDue: false,
      inReview: false,
      errorReason: null,
    });
  });

  it("flags actionDue when any entry awaits the user", () => {
    // Mirrors the real post-onboarding state where keyed identity failed and
    // Stripe now needs a document from the account holder.
    const summary = summarizeRequirements([
      { awaiting_action_from: "stripe", errors: [] },
      {
        awaiting_action_from: "user",
        errors: [{ description: "Identity could not be verified." }],
      },
    ]);
    expect(summary.actionDue).toBe(true);
    expect(summary.inReview).toBe(false);
    expect(summary.errorReason).toBe("Identity could not be verified.");
  });

  it("flags inReview when every entry awaits Stripe", () => {
    // Mirrors the pending_verification window right after submitting the SSN.
    expect(
      summarizeRequirements([
        { awaiting_action_from: "stripe", errors: [] },
        { awaiting_action_from: "stripe", errors: [] },
      ])
    ).toEqual({ actionDue: false, inReview: true, errorReason: null });
  });

  it("prefers the error on a user-actionable entry over a Stripe-side one", () => {
    const summary = summarizeRequirements([
      {
        awaiting_action_from: "stripe",
        errors: [{ description: "Stripe-side detail." }],
      },
      {
        awaiting_action_from: "user",
        errors: [{ description: "Fix this field." }],
      },
    ]);
    expect(summary.errorReason).toBe("Fix this field.");
  });

  it("falls back to a Stripe-side error when the user has nothing to fix", () => {
    const summary = summarizeRequirements([
      {
        awaiting_action_from: "stripe",
        errors: [{ description: "Verification hiccup." }],
      },
    ]);
    expect(summary).toEqual({
      actionDue: false,
      inReview: true,
      errorReason: "Verification hiccup.",
    });
  });
});
