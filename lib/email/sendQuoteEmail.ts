import { fmtDollar } from "@/lib/utils";
import { CustomerQuoteEmail } from "./CustomerQuoteEmail";
import { type SendEmailResult, sendEmail } from "./client";

export interface SendQuoteEmailInput {
  to: string;
  subject: string;
  message?: string;
  publicUrl: string;
  customerName: string;
  org: { name: string; phone: string | null; logo: string | null };
  quoteNumber: number;
  totalDollars: number;
  replyTo: string;
}

export function sendQuoteEmail(
  input: SendQuoteEmailInput
): Promise<SendEmailResult> {
  return sendEmail({
    to: input.to,
    subject: input.subject,
    replyTo: input.replyTo,
    react: CustomerQuoteEmail({
      customerName: input.customerName || "there",
      orgName: input.org.name,
      orgPhone: input.org.phone,
      orgLogo: input.org.logo,
      quoteNumber: input.quoteNumber,
      totalFormatted: fmtDollar(input.totalDollars),
      message: input.message,
      publicUrl: input.publicUrl,
    }),
  });
}
