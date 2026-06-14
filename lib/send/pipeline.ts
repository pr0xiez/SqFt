import { EmailFailedError, NotFoundError } from "@/lib/api/errors";
import { getPublicBaseUrl } from "@/lib/baseUrl";
import type { SendEmailResult } from "@/lib/email/client";
import { logError } from "@/lib/logger";

/**
 * The send pipeline: the one spine behind "email a customer-facing document"
 * (estimate, invoice, …). Owns the ordering and error contract that the send
 * routes used to duplicate:
 *
 *   load → guard → token (rotate iff requested or missing) → public URL →
 *   prepare → email → mark-sent → afterSent
 *
 * Invariants callers and adapters may rely on:
 * - The guard runs before any mutation; a blocked document never rotates.
 * - `onTokenRotated` fires iff rotation happened, before the email goes out;
 *   if it throws, the send aborts (nothing has been emailed yet).
 * - A failed email NEVER marks the document sent (`{ ok: false }` becomes
 *   `EmailFailedError` and the pipeline stops).
 * - `markSent` receives the same prepared value the email was built from, so
 *   what was mailed and what was persisted cannot diverge.
 * - `afterSent` is awaited but can never fail a send that already happened —
 *   rejections are logged and swallowed, but their outcome is *reported* to
 *   the caller via `SendResult.afterSentOk`, so a best-effort side effect
 *   (e.g. the estimate's opportunistic customer-email save) that fails is
 *   observable to the client instead of vanishing into the logs.
 *
 * Error modes: NotFoundError (missing doc, failed rotation, mark-sent miss),
 * whatever ConflictError subclass the guard throws, EmailFailedError. Routes
 * let the apiRoute wrapper translate these to the standard envelope.
 */

/** Identity of the user sending: email replyTo + mark-sent/event actor. */
export interface SendActor {
  email: string;
  name: string;
}

/** Fields every send request carries; documents may extend (estimate adds
 *  an optional cover `message`). */
export interface SendRequest {
  to: string;
  subject: string;
  regenerateLink?: boolean;
  sender: SendActor;
}

/**
 * The Sendable seam: everything that varies per document type, defined once
 * per document in its own `lib/send/send<Document>.ts` — never assembled at a
 * call site. All persistence arrives through these functions, so the spine
 * imports no Prisma and its tests need no database.
 *
 * TDoc      — the hydrated, org-scoped record `load` returns.
 * TPrepared — everything derived between guard and mark-sent (email payload,
 *             and for Invoice the frozen snapshot mark-sent must also see).
 * TReq      — the request shape; extends SendRequest for extra fields.
 */
export interface Sendable<
  TDoc,
  TPrepared,
  TReq extends SendRequest = SendRequest,
> {
  /** Org-scoped load. null → NotFoundError. */
  load(id: number, orgId: string): Promise<TDoc | null>;

  /** Status guard. Throws (a ConflictError subclass) to block the send. */
  guard(doc: TDoc): void;

  /** Current public token on the doc (approvalToken / publicToken). */
  currentToken(doc: TDoc): string | null;

  /** Org-scoped rotation. null → NotFoundError. */
  rotateToken(id: number, orgId: string): Promise<string | null>;

  /**
   * Audit hook fired iff the pipeline actually rotated, before the email.
   * Required: a document that doesn't audit rotation must say so with an
   * explicit no-op, so silence is a visible decision rather than drift.
   */
  onTokenRotated(id: number, req: TReq): Promise<void>;

  /** Path under the public base URL, e.g. `/estimate-review/${token}`. */
  publicPath(token: string): string;

  /** Derive the email payload (and any state mark-sent needs) from the doc. */
  prepare(
    doc: TDoc,
    publicUrl: string,
    req: TReq
  ): TPrepared | Promise<TPrepared>;

  /** The email port. Resolves to SendEmailResult — never throws for delivery. */
  sendEmail(prepared: TPrepared): Promise<SendEmailResult>;

  /** Atomic mark-sent (existing repo transactions own their sent/resent
   *  event). false → NotFoundError. */
  markSent(
    id: number,
    orgId: string,
    req: TReq,
    prepared: TPrepared
  ): Promise<boolean>;

  /** Optional post-send side effect (estimate: opportunistic customer-email
   *  update). Awaited, but failures never fail the send — they are logged and
   *  reported back as `afterSentOk: false` instead of being swallowed. */
  afterSent?(doc: TDoc, req: TReq): Promise<void>;
}

/**
 * Outcome of a completed send. The document was emailed and marked sent (any
 * failure before that throws). `afterSentOk` reports whether the optional
 * best-effort `afterSent` side effect succeeded: `true` when it ran cleanly or
 * the document declares no side effect, `false` when it threw (the failure was
 * logged, not propagated). Callers surface this so a swallowed metadata write
 * is observable rather than silent.
 */
export interface SendResult {
  afterSentOk: boolean;
}

export async function runSendPipeline<
  TDoc,
  TPrepared,
  TReq extends SendRequest,
>(
  sendable: Sendable<TDoc, TPrepared, TReq>,
  id: number,
  orgId: string,
  req: TReq
): Promise<SendResult> {
  const doc = await sendable.load(id, orgId);
  if (!doc) throw new NotFoundError();

  sendable.guard(doc);

  let token = sendable.currentToken(doc);
  if (req.regenerateLink || !token) {
    token = await sendable.rotateToken(id, orgId);
    if (!token) throw new NotFoundError();
    await sendable.onTokenRotated(id, req);
  }

  const publicUrl = `${getPublicBaseUrl()}${sendable.publicPath(token)}`;
  const prepared = await sendable.prepare(doc, publicUrl, req);

  const result = await sendable.sendEmail(prepared);
  if (!result.ok) throw new EmailFailedError(result.error ?? "Email failed");

  const marked = await sendable.markSent(id, orgId, req, prepared);
  if (!marked) throw new NotFoundError();

  if (sendable.afterSent) {
    try {
      await sendable.afterSent(doc, req);
    } catch (err) {
      logError({ errorMessage: "Post-send side effect failed", err });
      return { afterSentOk: false };
    }
  }
  return { afterSentOk: true };
}
