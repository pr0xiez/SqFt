import {
  ConflictError,
  EmailFailedError,
  NotFoundError,
  UnauthorizedError,
} from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import { sendInvoiceEmail } from "@/lib/email/sendInvoiceEmail";
import { invoiceIdParams, invoiceSendSchema } from "@/lib/invoices/schema";
import { snapshotInvoice } from "@/lib/invoices/snapshot";
import {
  getInvoiceForSend,
  markInvoiceSent,
  rotateInvoiceToken,
} from "@/lib/repositories";
import { buildInvoiceProrationSource } from "@/lib/repositories/invoiceRepo";
import { requireSession } from "@/lib/tenant";

export const POST = apiRoute(
  { minRole: "lead", input: invoiceSendSchema },
  async ({ orgId, input, params }) => {
    const session = await requireSession();
    const sender = session.user;
    if (!sender?.email || !sender?.name) throw new UnauthorizedError();

    const { id } = invoiceIdParams.parse(params);
    const invoice = await getInvoiceForSend(id, orgId);
    if (!invoice) throw new NotFoundError();
    if (invoice.status === "void") {
      throw new ConflictError("Cannot send a void invoice");
    }

    let token = invoice.publicToken;
    if (input.regenerateLink || !token) {
      token = await rotateInvoiceToken(id, orgId);
      if (!token) throw new NotFoundError();
    }

    const source = buildInvoiceProrationSource(invoice.estimate);
    const customer = invoice.estimate.siteMeasure.location.customer;
    const snapshot = snapshotInvoice(source, {
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
    });

    const publicUrl = `${getPublicBaseUrl()}/invoice-review/${token}`;
    const dueLabel = invoice.dueDate
      ? new Date(invoice.dueDate).toLocaleDateString("en-US")
      : null;

    const sendResult = await sendInvoiceEmail({
      to: input.to,
      subject: input.subject,
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
      replyTo: sender.email,
    });
    if (!sendResult.ok)
      throw new EmailFailedError(sendResult.error ?? "Email failed");

    const marked = await markInvoiceSent(id, orgId, {
      to: input.to,
      subject: input.subject,
      sentByEmail: sender.email,
      sentByName: sender.name,
      snapshot: snapshot as never,
    });
    if (!marked) throw new NotFoundError();

    return { ok: true };
  },
);
