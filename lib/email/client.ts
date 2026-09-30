import type { ReactElement } from "react";
import { Resend } from "resend";
import { getEnv } from "@/lib/env";
import { logError } from "@/lib/logger";
import { recordEmail } from "./test-helpers";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  react: ReactElement;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

// RFC 2606 reserved-for-testing domains. Never resolve to real mailboxes,
// so e2e tests can use them to exercise the send flow without burning Resend
// quota on a real send.
const TEST_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

function isTestRecipient(to: string | string[]): boolean {
  const addrs = Array.isArray(to) ? to : [to];
  return addrs.some((a) => {
    const domain = a.split("@")[1]?.toLowerCase();
    return domain ? TEST_DOMAINS.has(domain) : false;
  });
}

let _client: Resend | null = null;
function getClient(): Resend | null {
  const key = getEnv().RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

/**
 * Send a transactional email. In test mode (NODE_ENV=test, RESEND_API_KEY
 * unset, or a recipient on an RFC 2606 reserved-for-testing domain) records
 * the call into an in-memory list instead of hitting the network.
 */
export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const client = getClient();
  const FROM = getEnv().EMAIL_FROM;
  if (!client || process.env.NODE_ENV === "test" || isTestRecipient(input.to)) {
    recordEmail({
      to: input.to,
      subject: input.subject,
      from: FROM,
      replyTo: input.replyTo,
      react: input.react,
      recordedAt: new Date(),
    });
    return { ok: true, id: "test-mode" };
  }

  try {
    const { data, error } = await client.emails.send({
      from: FROM,
      to: input.to,
      subject: input.subject,
      react: input.react,
      replyTo: input.replyTo,
    });
    if (error) {
      logError({ errorMessage: `Resend error: ${error.message}`, err: error });
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown send error";
    logError({ errorMessage: `sendEmail threw: ${msg}`, err });
    return { ok: false, error: msg };
  }
}
