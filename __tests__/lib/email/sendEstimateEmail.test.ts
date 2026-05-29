import { beforeEach, describe, expect, it } from "vitest";
import { sendEstimateEmail } from "@/lib/email/sendEstimateEmail";
import { resetSentEmails, sentEmails } from "@/lib/email/test-helpers";

beforeEach(() => {
  delete process.env.RESEND_API_KEY;
  resetSentEmails();
});

describe("sendEstimateEmail", () => {
  it("records a single email with the configured subject and reply-to", async () => {
    const result = await sendEstimateEmail({
      to: "buyer@example.com",
      subject: "Estimate #5001 from Acme",
      message: "Hi Janet — please review.",
      publicUrl: "https://app.sqft.dev/q/abc123",
      customerName: "Janet",
      org: { name: "Acme Floors", phone: "555-1234", logo: null },
      estimateNumber: 5001,
      totalDollars: 6326.22,
      replyTo: "alex@acme.com",
    });

    expect(result.ok).toBe(true);
    const sent = sentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("Estimate #5001 from Acme");
    expect(sent[0].to).toBe("buyer@example.com");
    expect(sent[0].replyTo).toBe("alex@acme.com");
  });
});
