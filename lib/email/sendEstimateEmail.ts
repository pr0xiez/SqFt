import { fmtDollar } from "@/lib/utils";
import { CustomerEstimateEmail } from "./CustomerEstimateEmail";
import { type SendEmailResult, sendEmail } from "./client";

export interface SendEstimateEmailInput {
  to: string;
  subject: string;
  message?: string;
  publicUrl: string;
  customerName: string;
  org: { name: string; phone: string | null; logo: string | null };
  estimateNumber: number;
  totalDollars: number;
  replyTo: string;
}

export function sendEstimateEmail(
  input: SendEstimateEmailInput
): Promise<SendEmailResult> {
  return sendEmail({
    to: input.to,
    subject: input.subject,
    replyTo: input.replyTo,
    react: CustomerEstimateEmail({
      customerName: input.customerName || "there",
      orgName: input.org.name,
      orgPhone: input.org.phone,
      orgLogo: input.org.logo,
      estimateNumber: input.estimateNumber,
      totalFormatted: fmtDollar(input.totalDollars),
      message: input.message,
      publicUrl: input.publicUrl,
    }),
  });
}
