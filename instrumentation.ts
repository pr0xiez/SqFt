import type { Instrumentation } from "next";
import { logError } from "@/lib/logger";

export const onRequestError: Instrumentation.onRequestError = (
  err,
  request,
  context
) => {
  // Route handler errors are already logged by apiRoute / publicRoute.
  // This catches anything that slips through (e.g. an unwrapped handler).
  if (context.routeType === "route") {
    logError({
      method: request.method,
      path: request.path,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
};
