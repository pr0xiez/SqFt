import type { ReactElement } from "react";
import { Resend } from "resend";
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

const FROM = process.env.EMAIL_FROM ?? "SqFt Quotes <quotes@sqft.dev>";

let _client: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

/**
 * Send a transactional email. In test mode (NODE_ENV=test or RESEND_API_KEY
 * unset) records the call into an in-memory list instead of hitting the network.
 */
export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const client = getClient();
  if (!client || process.env.NODE_ENV === "test") {
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
