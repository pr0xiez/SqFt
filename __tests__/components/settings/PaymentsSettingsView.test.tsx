// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentsSettingsView } from "@/components/settings/PaymentsSettingsView";
import type { ConnectRequirements } from "@/lib/stripe/connect";
import {
  STRIPE_CONNECT_POLL_MS,
  type StripeConnectStatus,
} from "@/lib/stripe/connectPhase";

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PaymentsSettingsView />
    </QueryClientProvider>
  );
}

function requirements(
  over: Partial<ConnectRequirements> = {}
): ConnectRequirements {
  return { actionDue: false, inReview: false, issues: [], ...over };
}

/** Stub the status endpoint and hand back the mock so tests can count calls. */
function stubConnect(payload: StripeConnectStatus) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => payload,
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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/settings/payments");
});

describe("PaymentsSettingsView — states", () => {
  it("shows the active state when payments are live", async () => {
    stubConnect({ connected: true, status: "active", requirements: null });
    renderView();
    expect(await screen.findByText(/payments are active/i)).toBeDefined();
  });

  it("lists EVERY thing Stripe needs — with the field it belongs to — when the user must act", async () => {
    stubConnect({
      connected: true,
      status: "pending",
      requirements: requirements({
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
      }),
    });
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
    stubConnect({
      connected: true,
      status: "pending",
      requirements: requirements({ inReview: true }),
    });
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
    stubConnect({
      connected: true,
      status: "pending",
      requirements: requirements({
        inReview: true,
        issues: [
          { requirement: null, message: "The document could not be read." },
        ],
      }),
    });
    renderView();

    expect(
      await screen.findByText("Stripe is verifying your details")
    ).toBeDefined();
    expect(screen.getByText(/document could not be read/i)).toBeDefined();
    expect(screen.queryByText(/nothing to do on your end/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Re-run setup" })).toBeDefined();
  });

  it("shows the restricted card — not the in-review one — for a restricted account being re-reviewed", async () => {
    // The bug this guards: inReview was tested first, so a restricted account
    // was told "nothing to do on your end" while its payments were paused and
    // its customers were failing at checkout, and it never saw the dashboard
    // link this page added for exactly that case.
    stubConnect({
      connected: true,
      status: "restricted",
      requirements: requirements({ inReview: true }),
    });
    renderView();

    expect(
      await screen.findByText("Your Stripe account is restricted")
    ).toBeDefined();
    expect(screen.queryByText(/nothing to do on your end/i)).toBeNull();
    expect(
      screen.getByRole("link", { name: /open stripe dashboard/i })
    ).toBeDefined();
  });

  it("does not offer to re-run setup for a terminally unsupported account", async () => {
    stubConnect({
      connected: true,
      status: "unsupported",
      requirements: requirements(),
    });
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
    stubConnect({
      connected: true,
      status: "pending",
      requirements: requirements(),
    });
    renderView();
    expect(await screen.findByText("Finish setting up payments")).toBeDefined();
  });

  it("offers initial setup when not connected", async () => {
    stubConnect({ connected: false, status: null, requirements: null });
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
});

describe("PaymentsSettingsView — behavior", () => {
  it("actually refetches when Check status is clicked", async () => {
    const fetchMock = stubConnect({
      connected: true,
      status: "pending",
      requirements: requirements({ inReview: true }),
    });
    renderView();

    const button = await screen.findByRole("button", { name: "Check status" });
    const before = fetchMock.mock.calls.length;
    fireEvent.click(button);

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before)
    );
  });

  it("strips the onboarding flag from the URL so a reload can't re-arm the window", async () => {
    // Left in place, every reload or back-navigation re-armed a fresh
    // two-minute window — up to 24 more live Stripe reads each time, forever.
    returningFromOnboarding();
    stubConnect({
      connected: true,
      status: "pending",
      requirements: requirements({ inReview: true }),
    });
    renderView();

    expect(
      await screen.findByText("Stripe is verifying your details")
    ).toBeDefined();
    expect(window.location.search).toBe("");
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
    const fetchMock = stubConnect({
      connected: true,
      status: "pending",
      requirements: requirements({ inReview: true }),
    });
    renderView();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/this page updates automatically/i)).toBeDefined();

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    const before = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STRIPE_CONNECT_POLL_MS * 2);
    });

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
    const fetchMock = stubConnect({
      connected: true,
      status: "active",
      requirements: requirements(),
    });
    renderView();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const before = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(STRIPE_CONNECT_POLL_MS * 3);
    });
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});
