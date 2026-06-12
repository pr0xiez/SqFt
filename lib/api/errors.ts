/**
 * Errors thrown by API routes and repositories. Caught by the apiRoute wrapper
 * (lib/api/route.ts) and translated to the standard envelope:
 *
 *   { error: { code, message, details? } }
 *
 * Codes are documented in CONTEXT.md.
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(args: {
    code: string;
    status: number;
    message: string;
    details?: unknown;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super({ code: "UNAUTHORIZED", status: 401, message });
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden") {
    super({ code: "FORBIDDEN", status: 403, message });
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super({ code: "NOT_FOUND", status: 404, message });
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super({ code: "VALIDATION_FAILED", status: 400, message, details });
  }
}

export class ConflictError extends ApiError {
  constructor(message: string, code = "CONFLICT") {
    super({ code, status: 409, message });
  }
}

export class EstimateLockedError extends ConflictError {
  constructor(status: "approved" | "declined") {
    super(`Estimate is locked (status: ${status})`, "ESTIMATE_LOCKED");
  }
}

export class EstimateHasEventsError extends ConflictError {
  readonly eventCount: number;
  constructor(eventCount: number) {
    super(
      `Reassign or delete the ${eventCount} scheduled job(s) for this estimate first.`,
      "ESTIMATE_HAS_EVENTS"
    );
    this.eventCount = eventCount;
  }
}

/**
 * Thrown by the estimate / site-measure / customer delete paths when the
 * cascade would erase invoices (and their payment ledger). Invoices are
 * permanent financial records: void them, keep the records.
 */
export class HasInvoicesError extends ConflictError {
  readonly invoiceCount: number;
  constructor(invoiceCount: number) {
    super(
      `Can't delete: ${invoiceCount} invoice(s) (and any recorded payments) are attached. Void invoices instead of deleting their records.`,
      "HAS_INVOICES"
    );
    this.invoiceCount = invoiceCount;
  }
}

export class InvoiceLockedError extends ConflictError {
  constructor() {
    super(
      "This invoice has been sent and can no longer be edited.",
      "INVOICE_LOCKED"
    );
  }
}

/**
 * Thrown when sending a void invoice. Distinct from INVOICE_LOCKED ("sent,
 * no longer editable") — void is a terminal state with a different remedy
 * (create a new invoice).
 */
export class InvoiceVoidError extends ConflictError {
  constructor() {
    super("This invoice is void and cannot be sent.", "INVOICE_VOID");
  }
}

export class InvoiceOverbillError extends ConflictError {
  readonly unbilled: number;
  constructor(unbilled: number) {
    super(
      `Amount exceeds the estimate's unbilled balance ($${unbilled.toFixed(2)}).`,
      "INVOICE_OVERBILL"
    );
    this.unbilled = unbilled;
  }
}

export class EmailFailedError extends ApiError {
  constructor(message: string) {
    super({ code: "EMAIL_FAILED", status: 502, message });
  }
}

export class EmailTakenError extends ConflictError {
  constructor(message = "Email already in use") {
    super(message, "EMAIL_TAKEN");
  }
}

export class CannotDemoteSelfError extends ApiError {
  constructor(message = "You can't change your own role") {
    super({ code: "CANNOT_DEMOTE_SELF", status: 400, message });
  }
}

export class LastAdminError extends ApiError {
  constructor(message = "Can't remove the last admin in the organization") {
    super({ code: "LAST_ADMIN", status: 400, message });
  }
}

/**
 * Wire shape of the standard error envelope, as serialized by apiRoute / publicRoute.
 * Mirrors `ApiError` but on the response side — use this when reading non-OK fetch
 * responses on the client.
 */
export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

/**
 * Read the standard error envelope from a non-OK fetch Response. Returns the
 * provided fallback message if the body isn't JSON or doesn't match the envelope.
 *
 * Safe to call after `if (!res.ok)` — never throws on a malformed body.
 */
export async function readApiError(
  res: Response,
  fallback = "Request failed"
): Promise<{ code: string; message: string; details?: unknown }> {
  const body = (await res
    .json()
    .catch(() => null)) as Partial<ApiErrorEnvelope> | null;
  return {
    code: body?.error?.code ?? "UNKNOWN",
    message: body?.error?.message ?? fallback,
    details: body?.error?.details,
  };
}
