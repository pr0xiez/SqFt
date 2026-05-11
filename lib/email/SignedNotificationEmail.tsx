import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface SignedNotificationEmailProps {
  variant: "accepted" | "declined";
  quoteNumber: number;
  customerName: string;
  customerEmail: string | null;
  signedAtFormatted: string;
  totalFormatted: string;
  depositFormatted: string;
  declineReason?: string;
  builderUrl: string; // /quotes/{id} or /quotes/{id}/signed
}

const main = {
  backgroundColor: "#f4f3ed",
  fontFamily: "system-ui, sans-serif",
};
const container = {
  backgroundColor: "#fafaf7",
  padding: "32px",
  maxWidth: "560px",
  margin: "0 auto",
  borderRadius: "8px",
};
const heading = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#1a1a17",
  margin: "0 0 8px",
};
const para = {
  fontSize: "14px",
  color: "#3a3a35",
  lineHeight: 1.6,
  margin: "12px 0",
};
const button = {
  backgroundColor: "#1a1a17",
  color: "#ffffff",
  padding: "12px 22px",
  borderRadius: "6px",
  fontSize: "13px",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};

export function SignedNotificationEmail(p: SignedNotificationEmailProps) {
  const accepted = p.variant === "accepted";
  return (
    <Html>
      <Head />
      <Preview>
        {`${accepted ? "✓" : "✗"} ${p.customerName} ${accepted ? "signed" : "declined"} Quote #${p.quoteNumber}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={heading}>
            {accepted ? "Quote signed" : "Quote declined"}
          </Text>
          <Text style={para}>
            {p.customerName} {accepted ? "signed" : "declined"} Quote #
            {p.quoteNumber} on {p.signedAtFormatted}.
          </Text>
          {accepted ? (
            <>
              <Text style={para}>
                <strong>Total:</strong> {p.totalFormatted} ·{" "}
                <strong>Deposit due:</strong> {p.depositFormatted}
              </Text>
              {p.customerEmail && (
                <Text style={para}>Customer email: {p.customerEmail}</Text>
              )}
              <Text style={para}>
                What's next: contact {p.customerName.split(" ")[0]} to schedule
                and send the deposit invoice.
              </Text>
            </>
          ) : (
            p.declineReason && (
              <Text style={para}>
                Reason given: <em>{p.declineReason}</em>
              </Text>
            )
          )}
          <Section style={{ margin: "20px 0" }}>
            <Button href={p.builderUrl} style={button}>
              {accepted ? "View signed quote" : "Open quote"}
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
