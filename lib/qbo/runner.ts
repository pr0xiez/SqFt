/**
 * Glue between the pure engine and the real world: build deps and run an
 * org's due tasks. Called from `after()` hooks (latency optimization —
 * invariant 4: never in the request path) and from the cron sweeper
 * (`/api/qbo/sync/run` — the delivery guarantee). Never throws.
 */

import { logError } from "@/lib/logger";
import {
  getFreshAccessContext,
  listOrgsWithDueTasks,
  makeSyncStore,
  makeTaskStore,
} from "@/lib/repositories/qboRepo";
import { getQboConfig } from "./config";
import { makeQboPort } from "./port";
import { type RunResult, runDueTasksForOrg } from "./sync";

export async function runQboSyncForOrg(
  orgId: string
): Promise<RunResult | null> {
  if (!getQboConfig()) return null;
  try {
    const deps = {
      orgId,
      qbo: makeQboPort((opts) => getFreshAccessContext(orgId, opts)),
      store: makeSyncStore(),
    };
    return await runDueTasksForOrg(deps, makeTaskStore());
  } catch (err) {
    logError({
      path: "lib/qbo/runner#runQboSyncForOrg",
      orgId,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export interface SweepResult {
  orgs: number;
  done: number;
  failed: number;
}

/** One sweep across every org with due work (the cron entrypoint). */
export async function runQboSweep(): Promise<SweepResult> {
  const result: SweepResult = { orgs: 0, done: 0, failed: 0 };
  if (!getQboConfig()) return result;
  const orgIds = await listOrgsWithDueTasks(new Date());
  for (const orgId of orgIds) {
    const run = await runQboSyncForOrg(orgId);
    if (!run) continue;
    result.orgs += 1;
    result.done += run.done;
    result.failed += run.failed;
  }
  return result;
}
