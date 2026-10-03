// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PayInvoiceButton } from "@/components/invoices/PayInvoiceButton";
import { ToastProvider } from "@/components/ui/Toast";

const FALLBACK = /couldn't start checkout/i;

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function envelope(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function clickPay() {
  render(
    <ToastProvider>
      <PayInvoiceButton token="tok123" />
    </ToastProvider>
  );
  fireEvent.click(screen.getByRole("button", { name: /pay now/i }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PayInvoiceButton", () => {
  it.each([
    [
      503,
      "STRIPE_CHECKOUT_UNAVAILABLE",
      "Online payment isn't available right now. Please try again later or contact the business.",
    ],
    [
      409,
      "STRIPE_ACCOUNT_RESTRICTED",
      "Online payments aren't active for this business yet.",
    ],
  ])("shows the server's message for a typed %i %s", async (status, code, message) => {
    const fetchMock = stubFetch(async () => envelope(status, code, message));

    clickPay();

    expect(await screen.findByText(message)).toBeDefined();
    expect(screen.queryByText(FALLBACK)).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/invoice-review/tok123/checkout",
      expect.objectContaining({ method: "POST" })
    );
    // Re-enabled so the customer can try again.
    expect(
      (screen.getByRole("button", { name: /pay now/i }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });

  it("shows a friendly fallback — not 'Server error' — for an untyped 500", async () => {
    stubFetch(async () => envelope(500, "INTERNAL", "Server error"));

    clickPay();

    expect(await screen.findByText(FALLBACK)).toBeDefined();
    expect(screen.queryByText("Server error")).toBeNull();
  });

  it("shows the friendly fallback when the response isn't our JSON envelope", async () => {
    stubFetch(
      async () =>
        new Response("<html>502 Bad Gateway</html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        })
    );

    clickPay();

    expect(await screen.findByText(FALLBACK)).toBeDefined();
  });

  it("shows the friendly fallback when the request never reaches the server", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    clickPay();

    expect(await screen.findByText(FALLBACK)).toBeDefined();
    expect(screen.queryByText(/failed to fetch/i)).toBeNull();
    expect(
      (screen.getByRole("button", { name: /pay now/i }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
  });
});
