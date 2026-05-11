import { fmtDollar } from "@/lib/utils";
import { type SendEmailResult, sendEmail } from "./client";
import { SignedNotificationEmail } from "./SignedNotificationEmail";

export interface SendSignedNotificationInput {
  variant: "accepted" | "declined";
  to: string[];
  quoteId: number;
  quoteNumber: number;
  customerName: string;
  customerEmail: string | null;
  signedAt: Date;
  total: number;
  deposit: number;
  declineReason?: string;
}

export function sendSignedNotification(
  input: SendSignedNotificationInput
): Promise<SendEmailResult> {
  if (input.to.length === 0) {
    return Promise.resolve({ ok: true, id: "no-recipients" });
  }
  const baseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
  const builderUrl =
    input.variant === "accepted"
      ? `${baseUrl}/quotes/${input.quoteId}/signed`
      : `${baseUrl}/quotes/${input.quoteId}`;

  return sendEmail({
    to: input.to,
    subject:
      input.variant === "accepted"
        ? `✓ ${input.customerName} signed Quote #${input.quoteNumber}`
        : `Quote #${input.quoteNumber} was declined`,
    react: SignedNotificationEmail({
      variant: input.variant,
      quoteNumber: input.quoteNumber,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      signedAtFormatted: input.signedAt.toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      totalFormatted: fmtDollar(input.total),
      depositFormatted: fmtDollar(input.deposit),
      declineReason: input.declineReason,
      builderUrl,
    }),
  });
}
