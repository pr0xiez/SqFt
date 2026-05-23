/**
 * The API request seam.
 *
 * Three adapters: `apiRoute` for org-scoped endpoints, `adminRoute` for
 * admin-only org-scoped endpoints, and `publicRoute` for unauthenticated
 * (token-verified) endpoints. All three own:
 *   - input parsing via an optional Zod schema
 *   - error translation to the standard envelope (see CONTEXT.md)
 *   - request/mutation/error logging
 *
 * Handlers return a JSON-serializable value (wrapped in NextResponse.json),
 * an explicit Response (passed through), or null/undefined for 204.
 */

import { after, type NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { ApiError, UnauthorizedError, ValidationError } from "@/lib/api/errors";
import { logError, logMutation, logRequest } from "@/lib/logger";
import { getOrgId, requireSession } from "@/lib/tenant";

const MUTATION_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

type RouteCtx = { params: Promise<Record<string, string>> };

type HandlerResult = unknown;

type OrgHandlerArgs<TInput, TParams> = {
  req: NextRequest;
  orgId: string;
  input: TInput;
  params: TParams;
};

type PublicHandlerArgs<TInput, TParams> = {
  req: NextRequest;
  input: TInput;
  params: TParams;
};

type RouteOptions<TInput> = {
  /** Zod schema for the request body. When omitted, `input` is `undefined`. */
  input?: ZodType<TInput>;
  /** Success status when the handler returns a value (default 200, ignored for explicit Response). */
  status?: number;
};

type NextRouteHandler = (req: NextRequest, ctx: RouteCtx) => Promise<Response>;

// ── apiRoute ──────────────────────────────────────────────────────────────────

export function apiRoute<TInput = undefined, TParams = Record<string, string>>(
  handler: (args: OrgHandlerArgs<TInput, TParams>) => Promise<HandlerResult>
): NextRouteHandler;
export function apiRoute<TInput = undefined, TParams = Record<string, string>>(
  options: RouteOptions<TInput>,
  handler: (args: OrgHandlerArgs<TInput, TParams>) => Promise<HandlerResult>
): NextRouteHandler;
export function apiRoute<TInput, TParams>(
  optionsOrHandler:
    | RouteOptions<TInput>
    | ((args: OrgHandlerArgs<TInput, TParams>) => Promise<HandlerResult>),
  maybeHandler?: (
    args: OrgHandlerArgs<TInput, TParams>
  ) => Promise<HandlerResult>
): NextRouteHandler {
  const { options, handler } = normalizeArgs(optionsOrHandler, maybeHandler);

  return wrapHandler(async (req, ctx, logCtx) => {
    const orgId = await getOrgId();
    logCtx.orgId = orgId;
    const input = await parseInput<TInput>(req, options.input);
    const params = ((await ctx.params) ?? {}) as TParams;
    const value = await handler({ req, orgId, input, params });
    return toResponse(value, options.status);
  });
}

// ── publicRoute ───────────────────────────────────────────────────────────────

export function publicRoute<
  TInput = undefined,
  TParams = Record<string, string>,
>(
  handler: (args: PublicHandlerArgs<TInput, TParams>) => Promise<HandlerResult>
): NextRouteHandler;
export function publicRoute<
  TInput = undefined,
  TParams = Record<string, string>,
>(
  options: RouteOptions<TInput>,
  handler: (args: PublicHandlerArgs<TInput, TParams>) => Promise<HandlerResult>
): NextRouteHandler;
export function publicRoute<TInput, TParams>(
  optionsOrHandler:
    | RouteOptions<TInput>
    | ((args: PublicHandlerArgs<TInput, TParams>) => Promise<HandlerResult>),
  maybeHandler?: (
    args: PublicHandlerArgs<TInput, TParams>
  ) => Promise<HandlerResult>
): NextRouteHandler {
  const { options, handler } = normalizeArgs(optionsOrHandler, maybeHandler);

  return wrapHandler(async (req, ctx, _logCtx) => {
    const input = await parseInput<TInput>(req, options.input);
    const params = ((await ctx.params) ?? {}) as TParams;
    const value = await handler({ req, input, params });
    return toResponse(value, options.status);
  });
}

// ── internals ─────────────────────────────────────────────────────────────────

function normalizeArgs<TInput, TArgs>(
  a: RouteOptions<TInput> | ((args: TArgs) => Promise<HandlerResult>),
  b: ((args: TArgs) => Promise<HandlerResult>) | undefined
): {
  options: RouteOptions<TInput>;
  handler: (args: TArgs) => Promise<HandlerResult>;
} {
  if (typeof a === "function") return { options: {}, handler: a };
  if (!b) throw new Error("apiRoute: handler is required");
  return { options: a, handler: b };
}

async function parseInput<TInput>(
  req: NextRequest,
  schema: ZodType<TInput> | undefined
): Promise<TInput> {
  if (!schema) return undefined as TInput;
  if (req.method === "GET" || req.method === "HEAD") return undefined as TInput;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Validation failed";
    throw new ValidationError(first, parsed.error.issues);
  }
  return parsed.data;
}

function toResponse(value: HandlerResult, status?: number): Response {
  if (value instanceof Response) return value;
  if (value === null || value === undefined) {
    return new Response(null, { status: status ?? 204 });
  }
  return NextResponse.json(value, { status: status ?? 200 });
}

/**
 * Shared outer shell: runs the inner handler, catches ApiError → envelope,
 * catches everything else → 500 + logError, and schedules request/mutation
 * logging via `after()`.
 *
 * The inner handler receives a mutable `logCtx` for log enrichment. `apiRoute`
 * writes the resolved `orgId` into it once; `publicRoute` leaves it as
 * `"unauthenticated"`. This means each authenticated request resolves the
 * org once (not twice), and public requests skip `getOrgId()` entirely.
 */
function wrapHandler(
  inner: (
    req: NextRequest,
    ctx: RouteCtx,
    logCtx: { orgId: string }
  ) => Promise<Response>
): NextRouteHandler {
  return async (req, ctx) => {
    const start = Date.now();
    const method = req.method;
    const path = req.nextUrl.pathname;
    const logCtx = { orgId: "unauthenticated" };

    let res: Response;
    try {
      res = await inner(req, ctx, logCtx);
    } catch (err) {
      res = errorToResponse(err, { method, path, orgId: logCtx.orgId });
    }

    const durationMs = Date.now() - start;
    const { status } = res;

    after(() => {
      logRequest({
        method,
        path,
        status,
        durationMs,
        orgId: logCtx.orgId,
      });
      if (MUTATION_METHODS.has(method) && status >= 200 && status < 300) {
        logMutation({ method, path, status, orgId: logCtx.orgId });
      }
    });

    return res;
  };
}

// ── adminRoute ────────────────────────────────────────────────────────────────

/**
 * Like `apiRoute`, but also requires `session.user.role === "admin"`.
 * Non-admin and unauthenticated callers both receive 401 UNAUTHORIZED.
 */
export function adminRoute<
  TInput = undefined,
  TParams = Record<string, string>,
>(
  handler: (args: OrgHandlerArgs<TInput, TParams>) => Promise<HandlerResult>
): NextRouteHandler;
export function adminRoute<
  TInput = undefined,
  TParams = Record<string, string>,
>(
  options: RouteOptions<TInput>,
  handler: (args: OrgHandlerArgs<TInput, TParams>) => Promise<HandlerResult>
): NextRouteHandler;
export function adminRoute<TInput, TParams>(
  optionsOrHandler:
    | RouteOptions<TInput>
    | ((args: OrgHandlerArgs<TInput, TParams>) => Promise<HandlerResult>),
  maybeHandler?: (
    args: OrgHandlerArgs<TInput, TParams>
  ) => Promise<HandlerResult>
): NextRouteHandler {
  const { options, handler } = normalizeArgs(optionsOrHandler, maybeHandler);

  return wrapHandler(async (req, ctx, logCtx) => {
    const session = await requireSession();
    if (session.user.role !== "admin") {
      throw new UnauthorizedError();
    }
    const orgId = session.user.orgId;
    logCtx.orgId = orgId;
    const input = await parseInput<TInput>(req, options.input);
    const params = ((await ctx.params) ?? {}) as TParams;
    const value = await handler({ req, orgId, input, params });
    return toResponse(value, options.status);
  });
}

function errorToResponse(
  err: unknown,
  ctx: { method: string; path: string; orgId: string }
): Response {
  if (err instanceof ZodError) {
    return errorToResponse(
      new ValidationError(
        err.issues[0]?.message ?? "Validation failed",
        err.issues
      ),
      ctx
    );
  }
  if (err instanceof ApiError) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      },
      { status: err.status }
    );
  }

  logError({
    ...ctx,
    errorMessage: err instanceof Error ? err.message : String(err),
    err,
  });

  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Server error" } },
    { status: 500 }
  );
}
