import type { NextRequest } from "next/server";
import { UnauthorizedError } from "@/lib/api/errors";
import { publicRoute } from "@/lib/api/route";
import { runQboSweep } from "@/lib/qbo/runner";

/**
 * The cron sweeper — the delivery guarantee behind the opportunistic
 * after() attempts. Vercel cron invokes GET with
 * `Authorization: Bearer $CRON_SECRET`; the same bearer authorizes manual
 * POSTs. Allowlisted in lib/publicRoutes.ts (no session), so the bearer
 * check is the only gate — a missing CRON_SECRET env rejects everything.
 */
function requireCronAuth(req: NextRequest): void {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    throw new UnauthorizedError();
  }
}

const handler = publicRoute({}, async ({ req }) => {
  requireCronAuth(req);
  return runQboSweep();
});

export const GET = handler;
export const POST = handler;
