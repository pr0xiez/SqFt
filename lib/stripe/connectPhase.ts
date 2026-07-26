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
}

/**
 * Poll cadence while waiting for Stripe's async verification. Each poll is one
 * Stripe account read server-side, so keep this comfortably under Stripe's
 * rate limits (test mode allows 25 reads/s); the settings page also caps how
 * long it polls (see PaymentsSettingsView).
 */
export const STRIPE_CONNECT_POLL_MS = 5000;

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
  // Restricted outranks the requirement flags: payments are PAUSED and the
  // dashboard link on that card is the only way to see why. An account being
  // re-reviewed by Stripe is still a restricted account.
  if (data.status === "restricted") return "restricted";
  if (data.requirements?.actionDue) return "action-due";
  if (data.requirements?.inReview) return "in-review";
  return "incomplete";
}

/**
 * Milliseconds until the next poll, or false to stop. Keep refetching only
 * while Stripe is the one we're waiting on — and only in phases whose card
 * actually tells the user the page is updating itself.
 */
export function connectPollInterval(
  phase: ConnectPhase,
  data: StripeConnectStatus | undefined
): number | false {
  switch (phase) {
    // The first load is still in flight. "error" deliberately does NOT land
    // here: `data` is also undefined when every load so far has failed, and
    // pinning a failing endpoint for the whole window helps nobody.
    case "loading":
    case "in-review":
      return STRIPE_CONNECT_POLL_MS;
    // Stripe is re-reviewing a restricted account: the restriction can lift
    // with no user action, so this one is worth watching too.
    case "restricted":
      return data?.requirements?.inReview ? STRIPE_CONNECT_POLL_MS : false;
    default:
      return false;
  }
}

/** Whether the given phase's card should promise that it updates itself. */
export function connectPhasePolls(
  phase: ConnectPhase,
  data: StripeConnectStatus | undefined
): boolean {
  return connectPollInterval(phase, data) !== false;
}
