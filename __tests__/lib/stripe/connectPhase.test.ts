import { describe, expect, it } from "vitest";
import type { ConnectRequirements, ConnectStatus } from "@/lib/stripe/connect";
import {
  connectPhase,
  connectPollInterval,
  STRIPE_CONNECT_POLL_MS,
  type StripeConnectStatus,
} from "@/lib/stripe/connectPhase";

function requirements(
  over: Partial<ConnectRequirements> = {}
): ConnectRequirements {
  return { actionDue: false, inReview: false, issues: [], ...over };
}

function connected(
  status: ConnectStatus,
  reqs: ConnectRequirements | null = requirements()
): StripeConnectStatus {
  return { connected: true, status, requirements: reqs };
}

/** phase + poll decision together, the way the page and the hook consume them. */
function phaseOf(data: StripeConnectStatus | undefined, isError = false) {
  const phase = connectPhase({ data, isError });
  return { phase, interval: connectPollInterval(phase, data) };
}

describe("connectPhase", () => {
  it("is loading before the first response and error once a cold load fails", () => {
    expect(connectPhase({ data: undefined, isError: false })).toBe("loading");
    expect(connectPhase({ data: undefined, isError: true })).toBe("error");
  });

  it("keeps rendering real state when a refetch fails on a warm cache", () => {
    // React Query preserves the last successful data through an error, and the
    // page should keep showing it rather than flashing an error card.
    expect(connectPhase({ data: connected("active"), isError: true })).toBe(
      "active"
    );
  });

  it("is not-connected when the org has no Stripe account", () => {
    expect(
      connectPhase({
        data: { connected: false, status: null, requirements: null },
        isError: false,
      })
    ).toBe("not-connected");
  });

  it("is active when payments are live", () => {
    expect(phaseOf(connected("active")).phase).toBe("active");
  });

  it("is unsupported for a terminal account", () => {
    expect(phaseOf(connected("unsupported")).phase).toBe("unsupported");
  });

  it("puts restricted AHEAD of in-review", () => {
    // The bug this guards: testing inReview first told a restricted account
    // "Stripe is verifying your details — nothing to do on your end" while its
    // payments were paused and its customers were failing at checkout. The
    // restricted card (with the dashboard link) is the only one that says so.
    const data = connected("restricted", requirements({ inReview: true }));
    expect(phaseOf(data).phase).toBe("restricted");
  });

  it("puts restricted ahead of action-due too", () => {
    const data = connected("restricted", requirements({ actionDue: true }));
    expect(phaseOf(data).phase).toBe("restricted");
  });

  it("is action-due when the user owes Stripe something", () => {
    expect(
      phaseOf(connected("pending", requirements({ actionDue: true }))).phase
    ).toBe("action-due");
  });

  it("is in-review when only Stripe is working", () => {
    expect(
      phaseOf(connected("pending", requirements({ inReview: true }))).phase
    ).toBe("in-review");
  });

  it("is incomplete for a connected account with nothing outstanding", () => {
    // summarizeRequirements([]) — abandoned onboarding, or just back from it.
    expect(phaseOf(connected("pending")).phase).toBe("incomplete");
    expect(phaseOf(connected("pending", null)).phase).toBe("incomplete");
  });
});

describe("connectPollInterval", () => {
  it("polls while the first load is in flight", () => {
    expect(phaseOf(undefined).interval).toBe(STRIPE_CONNECT_POLL_MS);
  });

  it("stops after a cold failure instead of hammering a broken endpoint", () => {
    // `data` is undefined both for a first load AND for a query that has only
    // ever errored. Without the error check, a 500 from the endpoint got ~24
    // poll ticks (x the global retry) in the two-minute window, each running a
    // live Stripe read server-side before failing.
    expect(phaseOf(undefined, true).interval).toBe(false);
  });

  it("polls while Stripe is verifying", () => {
    expect(
      phaseOf(connected("pending", requirements({ inReview: true }))).interval
    ).toBe(STRIPE_CONNECT_POLL_MS);
  });

  it("polls a restricted account that Stripe is re-reviewing", () => {
    expect(
      phaseOf(connected("restricted", requirements({ inReview: true })))
        .interval
    ).toBe(STRIPE_CONNECT_POLL_MS);
  });

  it("does not poll a restricted account with nothing in review", () => {
    expect(phaseOf(connected("restricted")).interval).toBe(false);
  });

  it("does not poll when the ball is in the user's court", () => {
    expect(
      phaseOf(connected("pending", requirements({ actionDue: true }))).interval
    ).toBe(false);
  });

  it("does not poll behind a static card", () => {
    // The mismatch this guards: `pending` with no requirement entries used to
    // fall through to "keep polling" while the page rendered a static
    // "Finish setting up payments" card — two minutes of invisible Stripe reads
    // telling the user to redo onboarding they had just finished.
    expect(phaseOf(connected("pending")).interval).toBe(false);
    expect(phaseOf(connected("pending", null)).interval).toBe(false);
  });

  it("does not poll once there is nothing left to wait for", () => {
    expect(phaseOf(connected("active")).interval).toBe(false);
    expect(phaseOf(connected("unsupported")).interval).toBe(false);
    expect(
      phaseOf({ connected: false, status: null, requirements: null }).interval
    ).toBe(false);
  });
});
