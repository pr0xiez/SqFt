import { render } from "@react-email/render";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email/client", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));

import { sendEmail } from "@/lib/email/client";
import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";

describe("sendInvoiceEmail", () => {
  it("formats the amount and forwards to sendEmail", async () => {
    const res = await sendInvoiceEmail({
      to: "alex@example.com",
      subject: "Invoice #7465",
      coverNote: "Your deposit invoice is attached.",
      paymentInstructions: "WARNING…",
      publicUrl: "https://app.sqft.dev/invoice-review/tok",
      payUrl: null,
      customerName: "Alex",
      org: { name: "All About Hardwood", phone: null, logo: null },
      invoiceNumber: 7465,
      amountDollars: 7403.5,
      dueLabel: "06/06/2026",
      replyTo: "doug@example.com",
    });
    expect(res.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alex@example.com",
        subject: "Invoice #7465",
        replyTo: "doug@example.com",
      })
    );

    // Cheap regression guard: render the exact React element passed to
    // sendEmail (the one Resend would send) and confirm the customer-facing
    // HTML carries the formatted amount, recipient, and — most importantly
    // — a correct review/pay link built from `publicUrl` (falls back here
    // since `payUrl` is null).
    const call = vi.mocked(sendEmail).mock.calls[0][0];
    const html = await render(call.react);
    expect(html).toContain("$7403.50");
    expect(html).toContain("Alex");
    expect(html).toContain("All About Hardwood");
    expect(html).toContain('href="https://app.sqft.dev/invoice-review/tok"');
  });
});
