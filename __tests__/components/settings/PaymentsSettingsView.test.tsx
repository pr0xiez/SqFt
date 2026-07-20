// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentsSettingsView } from "@/components/settings/PaymentsSettingsView";

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PaymentsSettingsView />
    </QueryClientProvider>
  );
}

function stubConnect(payload: unknown) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/settings/payments");
});

describe("PaymentsSettingsView", () => {
  it("shows the active state when payments are live", async () => {
    stubConnect({ connected: true, status: "active", requirements: null });
    renderView();
    expect(await screen.findByText(/payments are active/i)).toBeDefined();
  });

  it("explains what Stripe needs — including the failure reason — when the user must act", async () => {
    stubConnect({
      connected: true,
      status: "pending",
      requirements: {
        actionDue: true,
        inReview: false,
        errorReason: "The person's keyed-in identity could not be verified.",
      },
    });
    renderView();
    expect(
      await screen.findByText("Stripe needs more information")
    ).toBeDefined();
    expect(
      screen.getByText(/keyed-in identity could not be verified/i)
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Continue setup" })
    ).toBeDefined();
  });

  it("shows the in-review state with a manual check button when nothing is due from the user", async () => {
    stubConnect({
      connected: true,
      status: "pending",
      requirements: { actionDue: false, inReview: true, errorReason: null },
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

  it("promises automatic updates while polling after returning from Stripe", async () => {
    window.history.replaceState(
      null,
      "",
      "/settings/payments?onboarding=return"
    );
    stubConnect({
      connected: true,
      status: "pending",
      requirements: { actionDue: false, inReview: true, errorReason: null },
    });
    renderView();
    expect(
      await screen.findByText(/this page updates automatically/i)
    ).toBeDefined();
  });

  it("falls back to the generic finish-setup card when connected without requirement info", async () => {
    stubConnect({ connected: true, status: "pending", requirements: null });
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
});
