import type { NextRequest } from "next/server";
import { after } from "next/server";
import { logError, logMutation, logRequest } from "./logger";
import { getOrgId } from "./tenant";

// biome-ignore lint/suspicious/noExplicitAny: route handlers have varying ctx shapes
type RouteHandler = (req: NextRequest, ctx?: any) => Promise<Response>;

const MUTATION_METHODS = new Set(["POST", "PATCH", "DELETE"]);

export function withLogging(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const start = Date.now();
    const method = req.method;
    const path = req.nextUrl.pathname;

    let orgId = "unauthenticated";
    try {
      orgId = await getOrgId();
    } catch {
      // request is unauthenticated — leave as default
    }

    let res: Response;
    try {
      res = await handler(req, ctx);
    } catch (err) {
      logError({
        method,
        path,
        orgId,
        errorMessage: err instanceof Error ? err.message : String(err),
        err,
      });
      throw err;
    }

    const durationMs = Date.now() - start;
    const { status } = res;

    after(() => {
      logRequest({ method, path, status, durationMs, orgId });
      if (MUTATION_METHODS.has(method) && status >= 200 && status < 300) {
        logMutation({ method, path, status, orgId });
      }
    });

    return res;
  };
}
