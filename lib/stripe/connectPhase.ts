import type { ConnectRequirements, ConnectStatus } from "./connect";

/**
 * The `GET /api/org/stripe/connect` response body. Declared once, from the same
 * types the route builds its response out of, so the two ends of the HTTP
 * contract can't drift — the client used to re-declare the requirements shape
 * inline next to the hook that consumed it.
 */
export interface StripeConnectStatus {
  connected: boolean;
  status: ConnectStatus | null;
  requirements: ConnectRequirements | null;
  /**
   * Whether this connected account has ever been active — now, or at some
   * point before (`Organization.stripeConnectOnboardedAt` is set). Stripe also
   * reports a brand-new account's capabilities as `restricted` while its
   * onboarding requirements are due or being verified, so `status` alone can't
   * tell "payments were paused" from "payments never started". False when not
   * connected.
   */
  everActive: boolean;
}

/** When the post-onboarding poll window closes for good. */
export const STRIPE_CONNECT_POLL_WINDOW_MS = 10 * 60 * 1000;

/**
 * How often the settings page re-reads Stripe after returning from
 * onboarding, by how long ago that window opened: each step's cadence holds
 * until its `untilMs`, and past the last step the user is left with the
 * "Check status" button.
 *
 * Each poll is one live Stripe account read server-side, so the cadence backs
 * off rather than holding the fast rate for the whole window. Test-mode
 * verification usually settles inside the first step, but has been seen
 * landing just past it (2m01s in a staging QA run — one tick after the old
 * flat two-minute window closed); live-mode identity checks can take hours, so
 * the window is a courtesy for the fast path, not a guarantee. (A Connect
 * webhook would remove the need to poll at all; see the note in
 * docs/superpowers/specs/2026-06-28-stripe-payments-design.md.)
 */
export const STRIPE_CONNECT_POLL_SCHEDULE: ReadonlyArray<{
  untilMs: number;
  everyMs: number;
}> = [
  { untilMs: 2 * 60 * 1000, everyMs: 5 * 1000 },
  { untilMs: STRIPE_CONNECT_POLL_WINDOW_MS, everyMs: 20 * 1000 },
];

/**
 * What the payments page is showing, and the only thing the poller keys off.
 *
 * The page and the poller used to derive this separately and disagree: the page
 * rendered a static "continue setup" card while the hook polled behind it, and
 * a restricted account got "nothing to do on your end" because the in-review
 * branch was tested first. One selector makes that class of bug unrepresentable.
 */
export type ConnectPhase =
  | "loading"
  | "error"
  | "not-connected"
  | "active"
  | "unsupported"
  | "restricted"
  | "action-due"
  | "in-review"
  | "incomplete";

export function connectPhase(input: {
  data: StripeConnectStatus | undefined;
  isError: boolean;
}): ConnectPhase {
  const { data, isError } = input;
  // React Query keeps the last successful data through an error, so a warm
  // cache goes on rendering real state; only a cold failure is the error phase.
  if (!data) return isError ? "error" : "loading";
  if (!data.connected) return "not-connected";
  if (data.status === "active") return "active";
  if (data.status === "unsupported") return "unsupported";
  // A restriction on an account that WAS active outranks the requirement
  // flags: payments are PAUSED and the dashboard link on that card is the only
  // way to see why. An account being re-reviewed by Stripe is still a
  // restricted account.
  //
  // A never-active account falls through instead: Stripe reports a brand-new
  // account as restricted while onboarding requirements are due or being
  // verified, and telling someone mid-onboarding that their payments were
  // "paused" is both wrong and alarming — they get the onboarding cards.
  if (data.status === "restricted" && data.everActive) return "restricted";
  if (data.requirements?.actionDue) return "action-due";
  if (data.requirements?.inReview) return "in-review";
  return "incomplete";
}

/**
 * Whether the phase is waiting on Stripe — the only phases worth polling, and
 * so the only cards that may promise the page updates itself.
 */
export function connectPhasePolls(
  phase: ConnectPhase,
  data: StripeConnectStatus | undefined
): boolean {
  switch (phase) {
    // The first load is still in flight. "error" deliberately does NOT land
    // here: `data` is also undefined when every load so far has failed, and
    // pinning a failing endpoint for the whole window helps nobody.
    case "loading":
    case "in-review":
      return true;
    // Stripe is re-reviewing a restricted account: the restriction can lift
    // with no user action, so this one is worth watching too.
    case "restricted":
      return data?.requirements?.inReview === true;
    default:
      return false;
  }
}

/**
 * Milliseconds until the next poll, or false to stop. The phase decides
 * whether there is anything to wait for; the schedule decides how often, given
 * how long ago the post-onboarding poll window opened.
 */
export function connectPollInterval(
  phase: ConnectPhase,
  data: StripeConnectStatus | undefined,
  elapsedMs: number
): number | false {
  if (!connectPhasePolls(phase, data)) return false;
  const step = STRIPE_CONNECT_POLL_SCHEDULE.find((s) => elapsedMs < s.untilMs);
  return step ? step.everyMs : false;
}
