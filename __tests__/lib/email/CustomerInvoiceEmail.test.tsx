import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import {
  CustomerInvoiceEmail,
  type CustomerInvoiceEmailProps,
} from "@/lib/email/CustomerInvoiceEmail";

// React (and by extension @react-email/render) inserts `<!-- -->` boundary
// comments between adjacent text/expression children (e.g. `INVOICE
// #{invoiceNumber}` renders as `INVOICE #<!-- -->7465`). Strip them so
// assertions can match the text a reader actually sees.
async function renderHtml(node: ReactElement): Promise<string> {
  return (await render(node)).replace(/<!--.*?-->/g, "");
}

const baseProps: CustomerInvoiceEmailProps = {
  customerName: "Alex Rivera",
  orgName: "All About Hardwood",
  orgPhone: null,
  orgLogo: null,
  invoiceNumber: 7465,
  amountFormatted: "$7,403.50",
  dueLabel: "06/06/2026",
  coverNote: "Your deposit invoice is attached.",
  paymentInstructions: "Wire transfer preferred.",
  payUrl: "https://app.sqft.dev/pay/tok-xyz789",
  publicUrl: "https://app.sqft.dev/invoice-review/tok-xyz789",
};

describe("CustomerInvoiceEmail", () => {
  it("renders the amount, invoice number, recipient, org name, and a correct pay link", async () => {
    const html = await renderHtml(CustomerInvoiceEmail(baseProps));

    expect(html).toContain("$7,403.50");
    expect(html).toContain("INVOICE #7465");
    expect(html).toContain("Alex Rivera");
    expect(html).toContain("All About Hardwood");
    expect(html).toContain(`href="${baseProps.payUrl}"`);
    expect(html).toContain("Pay invoice");
  });

  it("falls back to publicUrl (and 'View invoice' label) when payUrl is null", async () => {
    const html = await renderHtml(
      CustomerInvoiceEmail({ ...baseProps, payUrl: null })
    );

    expect(html).toContain(`href="${baseProps.publicUrl}"`);
    expect(html).not.toContain(`href="${baseProps.payUrl}"`);
    expect(html).toContain("View invoice");
    expect(html).not.toContain("Pay invoice");
  });

  it("renders the org logo when orgLogo is set", async () => {
    const html = await renderHtml(
      CustomerInvoiceEmail({
        ...baseProps,
        orgLogo: "https://cdn.sqft.dev/logos/hardwood.png",
      })
    );

    expect(html).toContain('src="https://cdn.sqft.dev/logos/hardwood.png"');
  });

  it("omits the logo image when orgLogo is null", async () => {
    const html = await renderHtml(CustomerInvoiceEmail(baseProps));

    expect(html).not.toContain("<img");
  });

  it("renders the due label when provided and omits it when null", async () => {
    const withDue = await renderHtml(CustomerInvoiceEmail(baseProps));
    expect(withDue).toContain("DUE 06/06/2026");

    const withoutDue = await renderHtml(
      CustomerInvoiceEmail({ ...baseProps, dueLabel: null })
    );
    expect(withoutDue).not.toContain("DUE ");
  });

  it("renders the cover note and payment instructions when provided", async () => {
    const html = await renderHtml(CustomerInvoiceEmail(baseProps));

    expect(html).toContain("Your deposit invoice is attached.");
    expect(html).toContain("Wire transfer preferred.");
  });

  it("omits the cover note and payment instructions when not provided", async () => {
    const { coverNote, paymentInstructions, ...rest } = baseProps;
    const html = await renderHtml(CustomerInvoiceEmail(rest));

    expect(html).not.toContain("Your deposit invoice is attached.");
    expect(html).not.toContain("Wire transfer preferred.");
  });
});
