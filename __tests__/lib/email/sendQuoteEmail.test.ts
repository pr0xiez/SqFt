import { beforeEach, describe, expect, it } from "vitest";
import { sendQuoteEmail } from "@/lib/email/sendQuoteEmail";
import { resetSentEmails, sentEmails } from "@/lib/email/test-helpers";

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  resetSentEmails();
});

describe("sendQuoteEmail", () => {
  it("records a single email with the configured subject and reply-to", async () => {
    const result = await sendQuoteEmail({
      to: "buyer@example.com",
      subject: "Quote #5001 from Acme",
      message: "Hi Janet — please review.",
      publicUrl: "https://app.sqft.dev/q/abc123",
      customerName: "Janet",
      org: { name: "Acme Floors", phone: "555-1234", logo: null },
      quoteNumber: 5001,
      totalDollars: 6326.22,
      replyTo: "alex@acme.com",
    });

    expect(result.ok).toBe(true);
    const sent = sentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Quote #5001 from Acme");
    expect(sent[0].to).toBe("buyer@example.com");
    expect(sent[0].replyTo).toBe("alex@acme.com");
  });
});
