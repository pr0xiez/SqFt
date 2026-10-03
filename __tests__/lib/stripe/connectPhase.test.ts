import { describe, expect, it } from "vitest";
import type { ConnectRequirements, ConnectStatus } from "@/lib/stripe/connect";
import {
  connectPhase,
  connectPhasePolls,
  connectPollInterval,
  STRIPE_CONNECT_POLL_SCHEDULE,
  STRIPE_CONNECT_POLL_WINDOW_MS,
  type StripeConnectStatus,
} from "@/lib/stripe/connectPhase";

const [FAST, SLOW] = STRIPE_CONNECT_POLL_SCHEDULE;

function requirements(
  over: Partial<ConnectRequirements> = {}
): ConnectRequirements {
  return { actionDue: false, inReview: false, issues: [], ...over };
}

/** A connected account. An active one has, by definition, been active. */
function connected(
  status: ConnectStatus,
  reqs: ConnectRequirements | null = requirements(),
  everActive = status === "active"
): StripeConnectStatus {
  return { connected: true, status, requirements: reqs, everActive };
}

/** Payments were live, then Stripe restricted the account. */
function restrictedAfterActive(
  reqs: ConnectRequirements | null = requirements()
) {
  return connected("restricted", reqs, true);
}

/**
 * A brand-new account mid-onboarding: Stripe reports its capabilities as
 * restricted while requirements are due or being verified.
 */
function restrictedNeverActive(
  reqs: ConnectRequirements | null = requirements()
) {
  return connected("restricted", reqs, false);
}

const NOT_CONNECTED: StripeConnectStatus = {
  connected: false,
  status: null,
  requirements: null,
  everActive: false,
};

/**
 * phase + poll decision together, the way the page and the hook consume them —
 * by default at the moment the post-onboarding window opens.
 */
function phaseOf(
  data: StripeConnectStatus | undefined,
  { isError = false, elapsedMs = 0 } = {}
) {
  const phase = connectPhase({ data, isError });
  return { phase, interval: connectPollInterval(phase, data, elapsedMs) };
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
    expect(connectPhase({ data: NOT_CONNECTED, isError: false })).toBe(
      "not-connected"
    );
  });

  it("is active when payments are live", () => {
    expect(phaseOf(connected("active")).phase).toBe("active");
  });

  it("is unsupported for a terminal account", () => {
    expect(phaseOf(connected("unsupported")).phase).toBe("unsupported");
  });

  it("is restricted when a once-active account has been restricted", () => {
    expect(phaseOf(restrictedAfterActive()).phase).toBe("restricted");
    expect(phaseOf(restrictedAfterActive(null)).phase).toBe("restricted");
  });

  it("puts a restriction on a once-active account AHEAD of in-review", () => {
    // The bug this guards: testing inReview first told a restricted account
    // "Stripe is verifying your details — nothing to do on your end" while its
    // payments were paused and its customers were failing at checkout. The
    // restricted card (with the dashboard link) is the only one that says so.
    const data = restrictedAfterActive(requirements({ inReview: true }));
    expect(phaseOf(data).phase).toBe("restricted");
  });

  it("puts it ahead of action-due too", () => {
    const data = restrictedAfterActive(requirements({ actionDue: true }));
    expect(phaseOf(data).phase).toBe("restricted");
  });

  it("gives a never-active restricted account the onboarding cards, not 'payments paused'", () => {
    // The bug this guards (staging QA): Stripe reports a brand-new account's
    // capabilities as restricted while onboarding requirements are due, then
    // while they're verified — and the page told that contractor Stripe had
    // "paused payments" on an account that had never taken one.
    expect(
      phaseOf(restrictedNeverActive(requirements({ actionDue: true }))).phase
    ).toBe("action-due");
    expect(
      phaseOf(restrictedNeverActive(requirements({ inReview: true }))).phase
    ).toBe("in-review");
    expect(phaseOf(restrictedNeverActive()).phase).toBe("incomplete");
    expect(phaseOf(restrictedNeverActive(null)).phase).toBe("incomplete");
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

describe("connectPollInterval — which phases poll", () => {
  it("polls while the first load is in flight", () => {
    expect(phaseOf(undefined).interval).toBe(FAST.everyMs);
  });

  it("stops after a cold failure instead of hammering a broken endpoint", () => {
    // `data` is undefined both for a first load AND for a query that has only
    // ever errored. Without the error check, a 500 from the endpoint got a
    // poll tick (x the global retry) all window long, each running a live
    // Stripe read server-side before failing.
    expect(phaseOf(undefined, { isError: true }).interval).toBe(false);
  });

  it("polls while Stripe is verifying", () => {
    expect(
      phaseOf(connected("pending", requirements({ inReview: true }))).interval
    ).toBe(FAST.everyMs);
  });

  it("polls a never-active account whose details Stripe is verifying", () => {
    // Stripe calls it restricted, but the page shows (and should watch) the
    // in-review card.
    expect(
      phaseOf(restrictedNeverActive(requirements({ inReview: true }))).interval
    ).toBe(FAST.everyMs);
  });

  it("polls a once-active restricted account that Stripe is re-reviewing", () => {
    expect(
      phaseOf(restrictedAfterActive(requirements({ inReview: true }))).interval
    ).toBe(FAST.everyMs);
  });

  it("does not poll a restricted account with nothing in review", () => {
    expect(phaseOf(restrictedAfterActive()).interval).toBe(false);
  });

  it("does not poll when the ball is in the user's court", () => {
    expect(
      phaseOf(connected("pending", requirements({ actionDue: true }))).interval
    ).toBe(false);
    expect(
      phaseOf(restrictedNeverActive(requirements({ actionDue: true }))).interval
    ).toBe(false);
  });

  it("does not poll behind a static card", () => {
    // The mismatch this guards: `pending` with no requirement entries used to
    // fall through to "keep polling" while the page rendered a static
    // "Finish setting up payments" card — a window of invisible Stripe reads
    // telling the user to redo onboarding they had just finished.
    expect(phaseOf(connected("pending")).interval).toBe(false);
    expect(phaseOf(connected("pending", null)).interval).toBe(false);
    expect(phaseOf(restrictedNeverActive()).interval).toBe(false);
  });

  it("does not poll once there is nothing left to wait for", () => {
    expect(phaseOf(connected("active")).interval).toBe(false);
    expect(phaseOf(connected("unsupported")).interval).toBe(false);
    expect(phaseOf(NOT_CONNECTED).interval).toBe(false);
  });
});

describe("connectPollInterval — the post-onboarding backoff", () => {
  const verifying = connected("pending", requirements({ inReview: true }));
  const at = (elapsedMs: number) => phaseOf(verifying, { elapsedMs }).interval;

  it("polls briskly for the first stretch after returning from onboarding", () => {
    expect(at(0)).toBe(FAST.everyMs);
    expect(at(FAST.untilMs - 1)).toBe(FAST.everyMs);
  });

  it("backs off after the fast stretch instead of giving up", () => {
    // The bug this guards (staging QA): verification finished 2m01s after the
    // user returned, one tick after the old flat two-minute window closed, and
    // the page sat on "still reviewing" for good.
    expect(at(FAST.untilMs)).toBe(SLOW.everyMs);
    expect(at(2 * 60 * 1000 + 1000)).toBe(SLOW.everyMs);
    expect(at(STRIPE_CONNECT_POLL_WINDOW_MS - 1)).toBe(SLOW.everyMs);
  });

  it("stops for good once the window closes", () => {
    expect(at(STRIPE_CONNECT_POLL_WINDOW_MS)).toBe(false);
    expect(at(STRIPE_CONNECT_POLL_WINDOW_MS * 10)).toBe(false);
  });

  it("only ever slows down, and runs out exactly at the window's end", () => {
    for (let i = 1; i < STRIPE_CONNECT_POLL_SCHEDULE.length; i++) {
      const prev = STRIPE_CONNECT_POLL_SCHEDULE[i - 1];
      const step = STRIPE_CONNECT_POLL_SCHEDULE[i];
      expect(step.untilMs).toBeGreaterThan(prev.untilMs);
      expect(step.everyMs).toBeGreaterThan(prev.everyMs);
    }
    expect(STRIPE_CONNECT_POLL_SCHEDULE.at(-1)?.untilMs).toBe(
      STRIPE_CONNECT_POLL_WINDOW_MS
    );
  });

  it("keeps a whole window to a few dozen live Stripe reads", () => {
    // Each poll is one Stripe account read server-side. Holding the fast
    // cadence for all ten minutes would be 120 of them.
    let reads = 0;
    let from = 0;
    for (const step of STRIPE_CONNECT_POLL_SCHEDULE) {
      reads += Math.ceil((step.untilMs - from) / step.everyMs);
      from = step.untilMs;
    }
    expect(reads).toBeLessThanOrEqual(50);
  });

  it("never polls a phase with nothing to wait for, however early", () => {
    expect(phaseOf(connected("active"), { elapsedMs: 0 }).interval).toBe(false);
  });
});

describe("connectPhasePolls", () => {
  it("agrees with the poller about every phase while the window is open", () => {
    // The card's "this page updates automatically" promise and the poll itself
    // must never disagree — that's the point of deriving both from one place.
    const samples: Array<StripeConnectStatus | undefined> = [
      undefined,
      NOT_CONNECTED,
      connected("active"),
      connected("unsupported"),
      connected("pending"),
      connected("pending", requirements({ actionDue: true })),
      connected("pending", requirements({ inReview: true })),
      restrictedAfterActive(),
      restrictedAfterActive(requirements({ inReview: true })),
      restrictedNeverActive(requirements({ actionDue: true })),
      restrictedNeverActive(requirements({ inReview: true })),
    ];
    for (const data of samples) {
      for (const isError of [false, true]) {
        const phase = connectPhase({ data, isError });
        expect(connectPhasePolls(phase, data)).toBe(
          connectPollInterval(phase, data, 0) !== false
        );
      }
    }
  });
});
