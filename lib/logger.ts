const ENV = process.env.NODE_ENV ?? "development";

function write(entry: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(entry) + "\n");
}

export function logRequest(ctx: {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  orgId: string;
}): void {
  write({ type: "request", ts: new Date().toISOString(), env: ENV, ...ctx });
}

export function logMutation(ctx: {
  method: string;
  path: string;
  status: number;
  orgId: string;
}): void {
  const resource = ctx.path.split("/")[2] ?? "unknown";
  write({ type: "mutation", ts: new Date().toISOString(), env: ENV, resource, ...ctx });
}

export function logError(ctx: {
  method?: string;
  path?: string;
  orgId?: string;
  status?: number;
  errorMessage?: string;
  err?: unknown;
}): void {
  const { err, ...rest } = ctx;
  write({ type: "error", ts: new Date().toISOString(), env: ENV, ...rest });
  if (err !== undefined) {
    console.error(err);
  }
}
