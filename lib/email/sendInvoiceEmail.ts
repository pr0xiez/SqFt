import { fmtDollar } from "@/lib/utils";
import { CustomerInvoiceEmail } from "./CustomerInvoiceEmail";
import { type SendEmailResult, sendEmail } from "./client";

export interface SendInvoiceEmailInput {
  to: string;
  subject: string;
  coverNote?: string;
  paymentInstructions?: string;
  publicUrl: string;
  payUrl: string | null;
  customerName: string;
  org: { name: string; phone: string | null; logo: string | null };
  invoiceNumber: number;
  amountDollars: number;
  dueLabel: string | null;
  replyTo: string;
}

export function sendInvoiceEmail(
  input: SendInvoiceEmailInput
): Promise<SendEmailResult> {
  return sendEmail({
    to: input.to,
    subject: input.subject,
    replyTo: input.replyTo,
    react: CustomerInvoiceEmail({
      customerName: input.customerName || "there",
      orgName: input.org.name,
      orgPhone: input.org.phone,
      orgLogo: input.org.logo,
      invoiceNumber: input.invoiceNumber,
      amountFormatted: fmtDollar(input.amountDollars),
      dueLabel: input.dueLabel,
      coverNote: input.coverNote,
      paymentInstructions: input.paymentInstructions,
      payUrl: input.payUrl,
      publicUrl: input.publicUrl,
    }),
  });
}
