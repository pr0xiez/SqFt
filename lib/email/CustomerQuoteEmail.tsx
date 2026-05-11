import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface CustomerQuoteEmailProps {
  customerName: string;
  orgName: string;
  orgPhone: string | null;
  orgLogo: string | null;
  quoteNumber: number;
  totalFormatted: string;
  message?: string;
  publicUrl: string;
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
const muted = { fontSize: "12px", color: "#6b6b66", margin: "0" };
const para = {
  fontSize: "14px",
  color: "#3a3a35",
  lineHeight: 1.6,
  margin: "16px 0",
};
const card = {
  backgroundColor: "#ffffff",
  border: "1px solid #e6e4dd",
  borderRadius: "6px",
  padding: "16px",
  margin: "16px 0",
};
const button = {
  backgroundColor: "#c0341a",
  color: "#ffffff",
  padding: "14px 24px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: 600,
  textDecoration: "none",
  display: "inline-block",
};
const fallback = {
  fontSize: "11px",
  color: "#6b6b66",
  marginTop: "12px",
  wordBreak: "break-all" as const,
};

export function CustomerQuoteEmail(props: CustomerQuoteEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{`Quote #${props.quoteNumber} from ${props.orgName} — ${props.totalFormatted}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section>
            {props.orgLogo ? (
              <Img
                src={props.orgLogo}
                alt={props.orgName}
                height={36}
                style={{ marginBottom: "8px" }}
              />
            ) : null}
            <Text style={heading}>{props.orgName}</Text>
            {props.orgPhone ? (
              <Text style={muted}>{props.orgPhone}</Text>
            ) : null}
          </Section>
          <Hr />
          <Section>
            <Text style={para}>Hi {props.customerName},</Text>
            {props.message ? <Text style={para}>{props.message}</Text> : null}
            <Text style={para}>
              Your quote is ready. Click below to review and sign.
            </Text>
          </Section>
          <Section style={card}>
            <Text style={muted}>QUOTE #{props.quoteNumber}</Text>
            <Text style={{ ...heading, fontSize: "24px", margin: "4px 0 0" }}>
              {props.totalFormatted}
            </Text>
          </Section>
          <Section style={{ textAlign: "center", margin: "24px 0" }}>
            <Button href={props.publicUrl} style={button}>
              View &amp; sign quote
            </Button>
            <Text style={fallback}>Or paste this link: {props.publicUrl}</Text>
          </Section>
          <Hr />
          <Text style={muted}>From {props.orgName} · Powered by SqFt</Text>
        </Container>
      </Body>
    </Html>
  );
}
