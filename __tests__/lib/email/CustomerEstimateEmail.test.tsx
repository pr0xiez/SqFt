import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import {
  CustomerEstimateEmail,
  type CustomerEstimateEmailProps,
} from "@/lib/email/CustomerEstimateEmail";

// React (and by extension @react-email/render) inserts `<!-- -->` boundary
// comments between adjacent text/expression children (e.g. `ESTIMATE
// #{estimateNumber}` renders as `ESTIMATE #<!-- -->5001`). Strip them so
// assertions can match the text a reader actually sees.
async function renderHtml(node: ReactElement): Promise<string> {
  return (await render(node)).replace(/<!--.*?-->/g, "");
}

const baseProps: CustomerEstimateEmailProps = {
  customerName: "Janet Wu",
  orgName: "Acme Floors",
  orgPhone: "555-1234",
  orgLogo: null,
  estimateNumber: 5001,
  totalFormatted: "$6,326.22",
  message: "Please review before Friday.",
  publicUrl: "https://app.sqft.dev/estimate-review/tok-abc123",
};

describe("CustomerEstimateEmail", () => {
  it("renders the total, estimate number, recipient, org name, and a correct review link", async () => {
    const html = await renderHtml(CustomerEstimateEmail(baseProps));

    expect(html).toContain("$6,326.22");
    expect(html).toContain("ESTIMATE #5001");
    expect(html).toContain("Janet Wu");
    expect(html).toContain("Acme Floors");
    expect(html).toContain(`href="${baseProps.publicUrl}"`);
  });

  it("renders the org logo when orgLogo is set", async () => {
    const html = await renderHtml(
      CustomerEstimateEmail({
        ...baseProps,
        orgLogo: "https://cdn.sqft.dev/logos/acme.png",
      })
    );

    expect(html).toContain('src="https://cdn.sqft.dev/logos/acme.png"');
  });

  it("omits the logo image when orgLogo is null", async () => {
    const html = await renderHtml(CustomerEstimateEmail(baseProps));

    expect(html).not.toContain("<img");
  });

  it("renders the custom message when provided", async () => {
    const html = await renderHtml(CustomerEstimateEmail(baseProps));

    expect(html).toContain("Please review before Friday.");
  });

  it("omits the message paragraph when message is not provided", async () => {
    const { message, ...rest } = baseProps;
    const html = await renderHtml(CustomerEstimateEmail(rest));

    expect(html).not.toContain("Please review before Friday.");
    // Still renders the standard body copy.
    expect(html).toContain("Your estimate is ready");
  });

  it("omits the org phone line when orgPhone is null", async () => {
    const html = await renderHtml(
      CustomerEstimateEmail({ ...baseProps, orgPhone: null })
    );

    expect(html).not.toContain("555-1234");
  });
});
