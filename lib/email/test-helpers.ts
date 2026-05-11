import type { ReactElement } from "react";

export interface RecordedEmail {
  to: string | string[];
  subject: string;
  from: string;
  replyTo?: string;
  react: ReactElement;
  recordedAt: Date;
}

const _sent: RecordedEmail[] = [];

export function recordEmail(email: RecordedEmail): void {
  _sent.push(email);
}

export function sentEmails(): RecordedEmail[] {
  return [..._sent];
}

export function resetSentEmails(): void {
  _sent.length = 0;
}
