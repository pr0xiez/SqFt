import { beforeEach, describe, expect, it } from "vitest";
import { sendEmail } from "@/lib/email/client";
import { resetSentEmails, sentEmails } from "@/lib/email/test-helpers";

beforeEach(() => resetSentEmails());

describe("sendEmail (test mode)", () => {
  it("records emails in memory and does not call Resend when RESEND_API_KEY is unset", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendEmail({
      to: "buyer@example.com",
      subject: "Hello",
      react: { type: "div", props: { children: "test" } } as never,
      replyTo: "sender@example.com",
    });
    expect(result.ok).toBe(true);
    expect(sentEmails()).toHaveLength(1);
    expect(sentEmails()[0].to).toBe("buyer@example.com");
    expect(sentEmails()[0].subject).toBe("Hello");
    expect(sentEmails()[0].replyTo).toBe("sender@example.com");
  });

  it("supports multiple recipients", async () => {
    delete process.env.RESEND_API_KEY;
    await sendEmail({
      to: ["a@example.com", "b@example.com"],
      subject: "Multi",
      react: { type: "div", props: {} } as never,
    });
    expect(sentEmails()[0].to).toEqual(["a@example.com", "b@example.com"]);
  });

  it("short-circuits to recordEmail for RFC 2606 test domains even when RESEND_API_KEY is set", async () => {
    process.env.RESEND_API_KEY = "re_fake_key_for_test";
    try {
      const result = await sendEmail({
        to: "customer@example.com",
        subject: "Estimate",
        react: { type: "div", props: {} } as never,
      });
      expect(result).toEqual({ ok: true, id: "test-mode" });
      expect(sentEmails()).toHaveLength(1);
    } finally {
      delete process.env.RESEND_API_KEY;
    }
  });
});
