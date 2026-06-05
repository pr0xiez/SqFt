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
  });
});
