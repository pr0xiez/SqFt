// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentConfirm } from "@/components/invoices/PaymentConfirm";

const CONFIRMED = "Payment received. Thank you!";

function stubFetch(
  impl: () => Promise<{ ok: boolean; json: () => Promise<unknown> }>
) {
  global.fetch = vi.fn(impl) as unknown as typeof fetch;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PaymentConfirm", () => {
  it("shows the confirmed banner only after the server verifies the session is paid", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ status: "paid" }),
    }));

    render(<PaymentConfirm token="tok123" sessionId="cs_1" />);

    expect(await screen.findByText(CONFIRMED)).toBeDefined();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/invoice-review/tok123/confirm",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("does not confirm while the payment is still pending", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ status: "pending" }),
    }));

    render(<PaymentConfirm token="tok123" sessionId="cs_1" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(CONFIRMED)).toBeNull();
  });

  it("shows bank-processing copy — not the confirmed banner — for a processing payment", async () => {
    // Async bank debit: session complete, funds unsettled. The customer gets
    // honest "processing" copy; "paid" waits for settlement via the webhook.
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ status: "processing" }),
    }));

    render(<PaymentConfirm token="tok123" sessionId="cs_1" />);

    expect(
      await screen.findByText(/bank payment is processing/i)
    ).toBeDefined();
    expect(screen.queryByText(CONFIRMED)).toBeNull();
  });

  it("shows an overpaid/refund notice — not the confirmed banner — for an overpayment", async () => {
    // A stale session completed after the balance was already covered: the money
    // is recorded and flagged for refund, so the customer sees a refund notice.
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ status: "overpaid" }),
    }));

    render(<PaymentConfirm token="tok123" sessionId="cs_1" />);

    expect(await screen.findByText(/refund the difference/i)).toBeDefined();
    expect(screen.queryByText(CONFIRMED)).toBeNull();
  });

  it("shows a failure notice — not processing — when the bank payment bounced", async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => ({ status: "failed" }),
    }));

    render(<PaymentConfirm token="tok123" sessionId="cs_1" />);

    expect(await screen.findByText(/didn.t go through/i)).toBeDefined();
    expect(screen.queryByText(CONFIRMED)).toBeNull();
    expect(screen.queryByText(/processing/i)).toBeNull();
  });

  it("does not confirm when the session can't be verified (spoofed session id)", async () => {
    // The confirm endpoint returns 404 for a bogus/mismatched session. A failed
    // verification must never render the confirmed banner.
    stubFetch(async () => ({ ok: false, json: async () => ({}) }));

    render(<PaymentConfirm token="tok123" sessionId="bogus" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText(CONFIRMED)).toBeNull();
  });
});
