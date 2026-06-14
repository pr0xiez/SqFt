import { InvoiceVoidError } from "@/lib/api/errors";
import {
  type SendInvoiceEmailInput,
  sendInvoiceEmail,
} from "@/lib/email/sendInvoiceEmail";
import { snapshotInvoice } from "@/lib/invoices/snapshot";
import type { InvoiceSnapshot } from "@/lib/invoices/types";
import {
  getInvoiceForSend,
  markInvoiceSent,
  rotateInvoiceToken,
  writeInvoiceEvent,
} from "@/lib/repositories";
import { buildInvoiceProrationSource } from "@/lib/repositories/invoiceRepo";
import {
  runSendPipeline,
  type Sendable,
  type SendRequest,
  type SendResult,
} from "./pipeline";

type InvoiceForSend = NonNullable<
  Awaited<ReturnType<typeof getInvoiceForSend>>
>;

/** The snapshot rides with the email payload so mark-sent freezes exactly
 *  what was mailed — paired by construction, not by convention. */
type InvoicePrepared = {
  email: SendInvoiceEmailInput;
  snapshot: InvoiceSnapshot;
};

const invoiceSendable: Sendable<InvoiceForSend, InvoicePrepared> = {
  load: getInvoiceForSend,

  guard(invoice) {
    if (invoice.status === "void") {
      throw new InvoiceVoidError();
    }
  },

  currentToken: (invoice) => invoice.publicToken,
  rotateToken: rotateInvoiceToken,

  onTokenRotated: (id, req) =>
    writeInvoiceEvent({
      invoiceId: id,
      type: "link_rotated",
      actorEmail: req.sender.email,
      actorName: req.sender.name,
    }),

  publicPath: (token) => `/invoice-review/${token}`,

  prepare(invoice, publicUrl, req) {
    const customer = invoice.estimate.siteMeasure.location.customer;
    const snapshot = snapshotInvoice(
      buildInvoiceProrationSource(invoice.estimate),
      {
        invoiceNumber: invoice.invoiceNumber,
        date: invoice.date,
        dueDate: invoice.dueDate,
        memo: invoice.memo,
        terms: invoice.terms,
        paymentInstructions: invoice.paymentInstructions,
        pct: invoice.pct,
        amount: invoice.amount,
        customer: customer
          ? {
              name: customer.name,
              address: invoice.estimate.siteMeasure.location.address,
              email: customer.email,
              phone: customer.phone,
            }
          : null,
        org: {
          name: invoice.org.name,
          address: invoice.org.address,
          phone: invoice.org.phone,
          licenseNumber: invoice.org.licenseNumber,
          logoUrl: invoice.org.logo,
        },
        stripePaymentLinkUrl: invoice.stripePaymentLinkUrl,
      }
    );
    const dueLabel = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString("en-US")
      : null;
    return {
      snapshot,
      email: {
        to: req.to,
        subject: req.subject,
        coverNote: invoice.coverNote || undefined,
        paymentInstructions: invoice.paymentInstructions || undefined,
        publicUrl,
        payUrl: invoice.stripePaymentLinkUrl,
        customerName: customer?.name ?? "there",
        org: {
          name: invoice.org.name,
          phone: invoice.org.phone,
          logo: invoice.org.logo,
        },
        invoiceNumber: invoice.invoiceNumber,
        amountDollars: invoice.amount,
        dueLabel,
        replyTo: req.sender.email,
      },
    };
  },

  sendEmail: (prepared) => sendInvoiceEmail(prepared.email),

  markSent: (id, orgId, req, prepared) =>
    markInvoiceSent(id, orgId, {
      to: req.to,
      subject: req.subject,
      sentByEmail: req.sender.email,
      sentByName: req.sender.name,
      snapshot: prepared.snapshot as never,
    }),
};

/** Email the customer their invoice link, freezing the snapshot on send. */
export function sendInvoice(
  id: number,
  orgId: string,
  req: SendRequest
): Promise<SendResult> {
  return runSendPipeline(invoiceSendable, id, orgId, req);
}
