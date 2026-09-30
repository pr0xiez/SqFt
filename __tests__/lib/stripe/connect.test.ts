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
  it("maps unrequested/pending and anything unknown to pending", () => {
    expect(mapCapabilityStatus("pending")).toBe("pending");
    expect(mapCapabilityStatus("unrequested")).toBe("pending");
    expect(mapCapabilityStatus(undefined)).toBe("pending");
    expect(mapCapabilityStatus("something-new")).toBe("pending");
  });
  it("maps restricted to restricted", () => {
    expect(mapCapabilityStatus("restricted")).toBe("restricted");
  });
  it("keeps unsupported distinct from pending", () => {
    // 'unsupported' is terminal — Stripe won't ever enable the capability for
    // this business/country/entity type. Folding it into 'pending' put the page
    // into a "Continue setup" loop that mints onboarding links forever for an
    // account that can never be approved.
    expect(mapCapabilityStatus("unsupported")).toBe("unsupported");
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
    expect(aggregateConnectStatus("unsupported", "active")).toBe("active");
  });
  it("is restricted when neither is active but one is restricted", () => {
    expect(aggregateConnectStatus("restricted", "pending")).toBe("restricted");
    expect(aggregateConnectStatus("pending", "restricted")).toBe("restricted");
    expect(aggregateConnectStatus("restricted", "unsupported")).toBe(
      "restricted"
    );
  });
  it("is pending when one capability is still in play", () => {
    expect(aggregateConnectStatus("pending", "pending")).toBe("pending");
    // One capability will never be enabled, but the other might — that account
    // is still worth pointing at onboarding.
    expect(aggregateConnectStatus("unsupported", "pending")).toBe("pending");
  });
  it("is unsupported only when BOTH capabilities are terminal", () => {
    expect(aggregateConnectStatus("unsupported", "unsupported")).toBe(
      "unsupported"
    );
  });
});

describe("summarizeRequirements", () => {
  it("reports nothing outstanding for no entries", () => {
    expect(summarizeRequirements(undefined)).toEqual({
      actionDue: false,
      inReview: false,
      issues: [],
    });
    expect(summarizeRequirements([])).toEqual({
      actionDue: false,
      inReview: false,
      issues: [],
    });
  });

  it("flags actionDue when a currently-due entry awaits the user", () => {
    // Mirrors the real post-onboarding state where keyed identity failed and
    // Stripe now needs a document from the account holder.
    const summary = summarizeRequirements([
      {
        awaiting_action_from: "stripe",
        minimum_deadline: { status: "currently_due" },
        errors: [],
      },
      {
        awaiting_action_from: "user",
        description: "individual.verification.document",
        minimum_deadline: { status: "currently_due" },
        errors: [{ description: "Identity could not be verified." }],
      },
    ]);
    expect(summary.actionDue).toBe(true);
    expect(summary.inReview).toBe(false);
    expect(summary.issues).toEqual([
      {
        requirement: "individual.verification.document",
        message: "Identity could not be verified.",
      },
    ]);
  });

  it("treats a past-due user entry as due", () => {
    const summary = summarizeRequirements([
      {
        awaiting_action_from: "user",
        minimum_deadline: { status: "past_due" },
        errors: [],
      },
    ]);
    expect(summary.actionDue).toBe(true);
  });

  it("treats a user entry with no deadline as due", () => {
    // Conservative: better to prompt than to sit silently on a requirement that
    // turns out to be blocking.
    const summary = summarizeRequirements([
      { awaiting_action_from: "user", errors: [] },
    ]);
    expect(summary.actionDue).toBe(true);
  });

  it("does NOT flag actionDue for an eventually_due user entry", () => {
    // The failure this guards: an eventually_due requirement is future work
    // that holds up nothing, but treating it as due painted the page with
    // "Stripe needs more information" AND stopped the post-onboarding poll on
    // its first tick, so the page never updated when verification landed.
    const summary = summarizeRequirements([
      { awaiting_action_from: "stripe", errors: [] },
      {
        awaiting_action_from: "user",
        minimum_deadline: { status: "eventually_due" },
        errors: [],
      },
    ]);
    expect(summary.actionDue).toBe(false);
    expect(summary.inReview).toBe(true);
  });

  it("is neither actionDue nor inReview when only future user work remains", () => {
    const summary = summarizeRequirements([
      {
        awaiting_action_from: "user",
        minimum_deadline: { status: "eventually_due" },
        errors: [],
      },
    ]);
    expect(summary).toEqual({ actionDue: false, inReview: false, issues: [] });
  });

  it("flags inReview when every entry awaits Stripe", () => {
    // Mirrors the pending_verification window right after submitting the SSN.
    expect(
      summarizeRequirements([
        { awaiting_action_from: "stripe", errors: [] },
        { awaiting_action_from: "stripe", errors: [] },
      ])
    ).toEqual({ actionDue: false, inReview: true, issues: [] });
  });

  it("reports only the user's own errors when the user must act", () => {
    // The bug this guards: an ungated fallback attributed a Stripe-side failure
    // to the user, so the card told them to go fix an SSN that wasn't theirs to
    // fix — and never named the document that actually blocked them.
    const summary = summarizeRequirements([
      {
        awaiting_action_from: "stripe",
        description: "individual.id_number",
        errors: [{ description: "The SSN provided could not be verified." }],
      },
      {
        awaiting_action_from: "user",
        description: "individual.verification.document",
        errors: [{ description: "Upload a government ID." }],
      },
    ]);
    expect(summary.actionDue).toBe(true);
    expect(summary.issues).toEqual([
      {
        requirement: "individual.verification.document",
        message: "Upload a government ID.",
      },
    ]);
  });

  it("collects EVERY error, not just the first, and orders them stably", () => {
    // Showing one of three sent people round the onboarding loop once per
    // problem, and which one they saw depended on Stripe's (undocumented)
    // entry order — two polls seconds apart could swap the text mid-read.
    const entries = [
      {
        awaiting_action_from: "user" as const,
        description: "individual.address",
        errors: [
          { description: "B: street address is invalid." },
          { description: "C: postal code could not be resolved." },
        ],
      },
      {
        awaiting_action_from: "user" as const,
        description: "individual.dob",
        errors: [{ description: "A: date of birth is under 18." }],
      },
    ];
    const summary = summarizeRequirements(entries);
    expect(summary.issues.map((i) => i.message)).toEqual([
      "A: date of birth is under 18.",
      "B: street address is invalid.",
      "C: postal code could not be resolved.",
    ]);
    // Same set, reversed by Stripe → same rendered order.
    expect(summarizeRequirements([...entries].reverse()).issues).toEqual(
      summary.issues
    );
  });

  it("de-duplicates identical errors on the same requirement", () => {
    const summary = summarizeRequirements([
      {
        awaiting_action_from: "user",
        description: "individual.dob",
        errors: [{ description: "Same." }, { description: "Same." }],
      },
    ]);
    expect(summary.issues).toHaveLength(1);
  });

  it("surfaces Stripe-side errors while in review", () => {
    const summary = summarizeRequirements([
      {
        awaiting_action_from: "stripe",
        description: "individual.verification.document",
        errors: [{ description: "The document could not be read." }],
      },
    ]);
    expect(summary).toEqual({
      actionDue: false,
      inReview: true,
      issues: [
        {
          requirement: "individual.verification.document",
          message: "The document could not be read.",
        },
      ],
    });
  });
});
