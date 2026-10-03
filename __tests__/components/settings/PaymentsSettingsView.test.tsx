// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentsSettingsView } from "@/components/settings/PaymentsSettingsView";
import type { ConnectRequirements, ConnectStatus } from "@/lib/stripe/connect";
import {
  STRIPE_CONNECT_POLL_SCHEDULE,
  STRIPE_CONNECT_POLL_WINDOW_MS,
  type StripeConnectStatus,
} from "@/lib/stripe/connectPhase";

const [FAST, SLOW] = STRIPE_CONNECT_POLL_SCHEDULE;

function renderView({ strict = false } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (
    <QueryClientProvider client={qc}>
      <PaymentsSettingsView />
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{view}</StrictMode> : view);
}

function requirements(
  over: Partial<ConnectRequirements> = {}
): ConnectRequirements {
  return { actionDue: false, inReview: false, issues: [], ...over };
}

/**
 * A connected account's status payload. `everActive` follows `status` unless
 * given — an active account has, by definition, been active, and anything else
 * defaults to an account still mid-onboarding.
 */
function account(
  status: ConnectStatus,
  reqs: ConnectRequirements | null = requirements(),
  everActive = status === "active"
): StripeConnectStatus {
  return { connected: true, status, requirements: reqs, everActive };
}

const NOT_CONNECTED: StripeConnectStatus = {
  connected: false,
  status: null,
  requirements: null,
  everActive: false,
};

/**
 * Stub the status endpoint and hand back the mock so tests can count calls.
 * Pass a function to answer each request with whatever is current by then.
 */
function stubConnect(
  payload: StripeConnectStatus | (() => StripeConnectStatus)
) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => (typeof payload === "function" ? payload() : payload),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubConnectFailure() {
  const fetchMock = vi.fn(async () => {
    throw new Error("network down");
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function returningFromOnboarding() {
  window.history.replaceState(null, "", "/settings/payments?onboarding=return");
}

/** Run fake time forward, letting React and React Query settle. */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/settings/payments");
});

describe("PaymentsSettingsView — states", () => {
  it("shows the active state when payments are live", async () => {
    stubConnect(account("active", null));
    renderView();
    expect(await screen.findByText(/payments are active/i)).toBeDefined();
  });

  it("lists EVERY thing Stripe needs — with the field it belongs to — when the user must act", async () => {
    stubConnect(
      account(
        "pending",
        requirements({
          actionDue: true,
          issues: [
            {
              requirement: "individual.dob",
              message: "The date of birth is under 18.",
            },
            {
              requirement: "individual.verification.document",
              message: "The document could not be read.",
            },
          ],
        })
      )
    );
    renderView();

    expect(
      await screen.findByText("Stripe needs more information")
    ).toBeDefined();
    // Both reasons, not just the first: showing one of two sends the user round
    // the onboarding loop once per problem.
    expect(screen.getByText(/date of birth is under 18/i)).toBeDefined();
    expect(screen.getByText(/document could not be read/i)).toBeDefined();
    expect(screen.getByText("(individual.dob)")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Continue setup" })
    ).toBeDefined();
  });

  it("shows the in-review state with a manual check button when nothing is due from the user", async () => {
    stubConnect(account("pending", requirements({ inReview: true })));
    renderView();

    expect(
      await screen.findByText("Stripe is verifying your details")
    ).toBeDefined();
    // Not returning from onboarding → no auto-polling, so the copy points at
    // the manual button instead of promising automatic updates.
    expect(screen.getByText(/check again/i)).toBeDefined();
    expect(screen.getByRole("button", { name: "Check status" })).toBeDefined();
    expect(screen.queryByText("Continue setup")).toBeNull();
  });

  it("surfaces the Stripe-side failure reason while in review, and a way out", async () => {
    // The reason was computed, asserted in unit tests and shipped over the wire,
    // but rendered only in the actionDue branch — so an admin whose document
    // failed saw "nothing to do on your end" and waited indefinitely.
    stubConnect(
      account(
        "pending",
        requirements({
          inReview: true,
          issues: [
            { requirement: null, message: "The document could not be read." },
          ],
        })
      )
    );
    renderView();

    expect(
      await screen.findByText("Stripe is verifying your details")
    ).toBeDefined();
    expect(screen.getByText(/document could not be read/i)).toBeDefined();
    expect(screen.queryByText(/nothing to do on your end/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Re-run setup" })).toBeDefined();
  });

  it("shows the restricted card — not the in-review one — for a once-active account being re-reviewed", async () => {
    // The bug this guards: inReview was tested first, so a restricted account
    // was told "nothing to do on your end" while its payments were paused and
    // its customers were failing at checkout, and it never saw the dashboard
    // link this page added for exactly that case.
    stubConnect(account("restricted", requirements({ inReview: true }), true));
    renderView();

    expect(
      await screen.findByText("Your Stripe account is restricted")
    ).toBeDefined();
    expect(screen.queryByText(/nothing to do on your end/i)).toBeNull();
    expect(
      screen.getByRole("link", { name: /open stripe dashboard/i })
    ).toBeDefined();
  });

  it("gives a re-reviewed restricted account the Check status button its copy points at", async () => {
    // The copy ended "Use the button below to check again." while the card
    // rendered only Continue setup and the dashboard link.
    const fetchMock = stubConnect(
      account("restricted", requirements({ inReview: true }), true)
    );
    renderView();

    expect(
      await screen.findByText(/use the button below to check again/i)
    ).toBeDefined();
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Check status" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before)
    );
  });

  it("does not offer Check status on a restricted card with nothing in review", async () => {
    stubConnect(account("restricted", requirements({ actionDue: true }), true));
    renderView();

    expect(
      await screen.findByText("Your Stripe account is restricted")
    ).toBeDefined();
    expect(screen.queryByText(/check again/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Check status" })).toBeNull();
  });

  it("tells an account mid-onboarding that Stripe is verifying it — not that its payments were paused", async () => {
    // The bug this guards (staging QA): Stripe reports a never-active account
    // as restricted while its onboarding details are verified, and the page
    // told a contractor who had never taken a payment that Stripe had
    // "paused payments" on their account.
    stubConnect(account("restricted", requirements({ inReview: true })));
    renderView();

    expect(
      await screen.findByText("Stripe is verifying your details")
    ).toBeDefined();
    expect(screen.queryByText(/restricted/i)).toBeNull();
    expect(screen.queryByText(/paused/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Check status" })).toBeDefined();
  });

  it("asks an account mid-onboarding for what Stripe still needs, even while Stripe calls it restricted", async () => {
    stubConnect(
      account(
        "restricted",
        requirements({
          actionDue: true,
          issues: [
            {
              requirement: "individual.id_number",
              message: "The SSN could not be verified.",
            },
          ],
        })
      )
    );
    renderView();

    expect(
      await screen.findByText("Stripe needs more information")
    ).toBeDefined();
    expect(screen.getByText(/ssn could not be verified/i)).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Continue setup" })
    ).toBeDefined();
    expect(screen.queryByText(/paused/i)).toBeNull();
  });

  it("does not offer to re-run setup for a terminally unsupported account", async () => {
    stubConnect(account("unsupported"));
    renderView();

    expect(
      await screen.findByText(/can't enable payments for this account/i)
    ).toBeDefined();
    // Re-running onboarding can never fix `unsupported` — offering it is an
    // infinite loop.
    expect(screen.queryByRole("button", { name: /setup/i })).toBeNull();
    expect(
      screen.getByRole("link", { name: /open stripe dashboard/i })
    ).toBeDefined();
  });

  it("falls back to the generic finish-setup card when nothing is outstanding", async () => {
    // summarizeRequirements([]) — the abandoned-onboarding path.
    stubConnect(account("pending"));
    renderView();
    expect(await screen.findByText("Finish setting up payments")).toBeDefined();
  });

  it("falls back to finish-setup for a never-active restricted account with nothing outstanding", async () => {
    stubConnect(account("restricted"));
    renderView();
    expect(await screen.findByText("Finish setting up payments")).toBeDefined();
    expect(screen.queryByText(/paused/i)).toBeNull();
  });

  it("offers initial setup when not connected", async () => {
    stubConnect(NOT_CONNECTED);
    renderView();
    expect(await screen.findByText("Accept card payments")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Set up payments" })
    ).toBeDefined();
  });

  it("says the status could not be loaded instead of showing the first-run card", async () => {
    // With no error branch, a failed fetch on a cold cache rendered "Accept card
    // payments / Set up payments" to an org that already had a Stripe account.
    stubConnectFailure();
    renderView();

    expect(
      await screen.findByText(/couldn't load your payment status/i)
    ).toBeDefined();
    expect(screen.queryByText("Accept card payments")).toBeNull();
  });

  it.each<[string, StripeConnectStatus]>([
    ["not connected", NOT_CONNECTED],
    ["active", account("active")],
    ["unsupported", account("unsupported")],
    ["restricted after active", account("restricted", requirements(), true)],
    [
      "restricted after active, re-reviewed",
      account("restricted", requirements({ inReview: true }), true),
    ],
    [
      "restricted after active, action due",
      account("restricted", requirements({ actionDue: true }), true),
    ],
    [
      "restricted mid-onboarding, in review",
      account("restricted", requirements({ inReview: true })),
    ],
    [
      "restricted mid-onboarding, action due",
      account("restricted", requirements({ actionDue: true })),
    ],
    [
      "pending, in review",
      account("pending", requirements({ inReview: true })),
    ],
    [
      "pending, in review with an issue",
      account(
        "pending",
        requirements({
          inReview: true,
          issues: [{ requirement: null, message: "Document unreadable." }],
        })
      ),
    ],
    [
      "pending, action due",
      account("pending", requirements({ actionDue: true })),
    ],
    ["pending, nothing outstanding", account("pending")],
  ])("never points at a button that isn't there — %s", async (_name, payload) => {
    stubConnect(payload);
    renderView();
    await waitFor(() => expect(screen.queryByText("Loading…")).toBeNull());

    if (screen.queryByText(/use the button below/i)) {
      expect(
        screen.getByRole("button", { name: "Check status" })
      ).toBeDefined();
    }
  });
});

describe("PaymentsSettingsView — behavior", () => {
  it("actually refetches when Check status is clicked", async () => {
    const fetchMock = stubConnect(
      account("pending", requirements({ inReview: true }))
    );
    renderView();

    const button = await screen.findByRole("button", { name: "Check status" });
    const before = fetchMock.mock.calls.length;
    fireEvent.click(button);

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before)
    );
  });

  it("strips the onboarding flag from the URL so a reload can't re-arm the window", async () => {
    // Left in place, every reload or back-navigation re-armed a fresh polling
    // window — dozens more live Stripe reads each time, forever.
    returningFromOnboarding();
    stubConnect(account("pending", requirements({ inReview: true })));
    renderView();

    expect(
      await screen.findByText("Stripe is verifying your details")
    ).toBeDefined();
    expect(window.location.search).toBe("");
  });

  it("opens no polling window when Stripe's link expired, but still consumes the flag", async () => {
    // `refresh` means the onboarding link expired before the user finished:
    // nothing new is being verified, and nothing can change until a new link
    // is minted, so there is nothing to watch.
    vi.useFakeTimers();
    window.history.replaceState(
      null,
      "",
      "/settings/payments?onboarding=refresh"
    );
    const fetchMock = stubConnect(
      account("pending", requirements({ inReview: true }))
    );
    renderView();

    await advance(0);
    expect(window.location.search).toBe("");
    expect(screen.getByText(/use the button below/i)).toBeDefined();

    const before = fetchMock.mock.calls.length;
    await advance(FAST.everyMs * 3);
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("keeps polling while the tab is hidden, and never disables the manual button to do it", async () => {
    // Two failures in one: React Query suppresses interval refetches on a
    // hidden tab by default, while the poll window is wall-clock — so someone
    // who reads "this page updates automatically" and switches to their inbox
    // came back to a window that had expired without polling once. And
    // `disabled={isFetching}` flipped the button off on every background poll,
    // dropping clicks and blurring it out from under keyboard users.
    vi.useFakeTimers();
    returningFromOnboarding();
    const fetchMock = stubConnect(
      account("pending", requirements({ inReview: true }))
    );
    renderView();

    await advance(0);
    expect(screen.getByText(/this page updates automatically/i)).toBeDefined();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    const before = fetchMock.mock.calls.length;
    await advance(FAST.everyMs * 2);

    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    expect(
      screen.getByRole("button", { name: "Check status" })
    ).not.toBeDisabled();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  it("stops polling once the account goes active", async () => {
    vi.useFakeTimers();
    returningFromOnboarding();
    const fetchMock = stubConnect(account("active"));
    renderView();

    await advance(0);
    const before = fetchMock.mock.calls.length;
    await advance(FAST.everyMs * 3);
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it("keeps watching past the fast stretch, so verification that lands at 2m01s still flips the page", async () => {
    // The bug this guards (staging QA): a fresh account's verification finished
    // 2m01s after the user returned — one tick after the old flat two-minute
    // window closed — and the page sat on "Stripe is verifying" for good.
    vi.useFakeTimers();
    returningFromOnboarding();
    const returnedAt = Date.now();
    stubConnect(() =>
      Date.now() - returnedAt < 2 * 60 * 1000 + 1000
        ? account("restricted", requirements({ inReview: true }))
        : account("active")
    );
    renderView();

    await advance(0);
    expect(screen.getByText("Stripe is verifying your details")).toBeDefined();
    expect(screen.getByText(/this page updates automatically/i)).toBeDefined();

    await advance(FAST.untilMs + SLOW.everyMs * 2);
    expect(screen.getByText(/payments are active/i)).toBeDefined();
  });

  it("backs off to a gentler cadence after the fast stretch instead of stopping", async () => {
    vi.useFakeTimers();
    returningFromOnboarding();
    const fetchMock = stubConnect(
      account("pending", requirements({ inReview: true }))
    );
    renderView();
    await advance(0);

    // One live Stripe read per tick: brisk for the first stretch…
    const atStart = fetchMock.mock.calls.length;
    await advance(FAST.untilMs);
    expect(fetchMock.mock.calls.length - atStart).toBeGreaterThanOrEqual(
      FAST.untilMs / FAST.everyMs - 1
    );

    // …then still polling, but at the slow cadence.
    const atBackoff = fetchMock.mock.calls.length;
    await advance(SLOW.everyMs * 4);
    const slowPolls = fetchMock.mock.calls.length - atBackoff;
    expect(slowPolls).toBeGreaterThanOrEqual(3);
    expect(slowPolls).toBeLessThanOrEqual(5);
    expect(screen.getByText(/this page updates automatically/i)).toBeDefined();
  });

  it("stops polling for good when the window closes, and stops promising to update", async () => {
    vi.useFakeTimers();
    returningFromOnboarding();
    const fetchMock = stubConnect(
      account("pending", requirements({ inReview: true }))
    );
    renderView();

    await advance(STRIPE_CONNECT_POLL_WINDOW_MS - 1);
    expect(screen.getByText(/this page updates automatically/i)).toBeDefined();

    await advance(1);
    // The window has closed: the copy now points at the manual button…
    expect(
      screen.getByText(/use the button below to check again/i)
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Check status" })
    ).not.toBeDisabled();

    // …and nothing polls any more.
    const atClose = fetchMock.mock.calls.length;
    await advance(SLOW.everyMs * 5);
    expect(fetchMock.mock.calls.length).toBe(atClose);
  });

  it("still closes the window under Strict Mode's dev-only remount", async () => {
    // The flag is consumed on first sight, so a window timer owned by the
    // flag-reading effect was cancelled by Strict Mode's simulated remount and
    // never re-armed: in dev the page promised to update itself forever.
    vi.useFakeTimers();
    returningFromOnboarding();
    stubConnect(account("pending", requirements({ inReview: true })));
    renderView({ strict: true });

    await advance(0);
    expect(screen.getByText(/this page updates automatically/i)).toBeDefined();

    await advance(STRIPE_CONNECT_POLL_WINDOW_MS);
    expect(
      screen.getByText(/use the button below to check again/i)
    ).toBeDefined();
  });
});
