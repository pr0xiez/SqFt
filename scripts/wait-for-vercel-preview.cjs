// Waits for the Vercel preview of a PR's head commit by reading the GitHub
// deployments Vercel creates for it. Run from the E2E job in
// .github/workflows/pr.yml via actions/github-script; sets the `url` output.
//
// Status semantics observed on this repo (statuses are listed newest first):
// - `success`: the preview is up. A later status can follow it on the same
//   deployment, but the success URL keeps serving that commit.
// - `failure` / `error`: the build failed; fail at once.
// - `inactive` ("Canceled from the Vercel Dashboard", carrying the cancelled
//   build's URL): Vercel usually posts a `success` for a rebuild on the same
//   deployment a minute or two later, but a skipped build (ignoreCommand)
//   never gets one. Wait a grace period, then fail.
// - anything else (pending, queued, in_progress, no status yet): keep waiting.

const VERCEL_BOT = "vercel[bot]";

/**
 * Pure decision over the deployments for one commit (newest first), each
 * carrying its statuses (newest first; may be omitted for older ones).
 * @param {Array<{ id: number, statuses?: Array<{ id: number, state: string, description?: string | null, environment_url?: string | null, target_url?: string | null, log_url?: string | null }> }>} deployments
 */
function decidePreview(deployments) {
  const [newest] = deployments;
  if (!newest) return { kind: "waiting", reason: "no deployment yet" };
  const statuses = newest.statuses ?? [];
  const latest = statuses[0];
  if (!latest) {
    return {
      kind: "waiting",
      reason: `deployment ${newest.id} has no status yet`,
    };
  }
  if (latest.state === "failure" || latest.state === "error") {
    return { kind: "failed", deployment: newest, status: latest };
  }
  const success = statuses.find((s) => s.state === "success");
  if (success) return { kind: "ready", deployment: newest, status: success };
  if (latest.state === "inactive") {
    // An older deployment of the same commit that succeeded is just as good.
    for (const older of deployments.slice(1)) {
      const s = older.statuses?.find((x) => x.state === "success");
      if (s) return { kind: "ready", deployment: older, status: s };
    }
    return { kind: "canceled", deployment: newest, status: latest };
  }
  return {
    kind: "waiting",
    reason: `deployment ${newest.id} is ${latest.state}`,
  };
}

/** @param {number} ms */
function duration(ms) {
  return ms >= 60000
    ? `${Math.round(ms / 60000)} min`
    : `${Math.round(ms / 1000)}s`;
}

/** @param {{ environment_url?: string | null, target_url?: string | null }} status */
function statusUrl(status) {
  return status.environment_url || status.target_url || "";
}

/**
 * @param {{
 *   github: any, context: any, core: any,
 *   environment: string, sha: string,
 *   timeoutMs?: number, inactiveGraceMs?: number, intervalMs?: number,
 *   now?: () => number, sleep?: (ms: number) => Promise<unknown>,
 * }} options
 */
async function waitForVercelPreview({
  github,
  context,
  core,
  environment,
  sha,
  timeoutMs = 10 * 60 * 1000,
  inactiveGraceMs = 3 * 60 * 1000,
  intervalMs = 10 * 1000,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const short = sha.slice(0, 7);
  const label = `"${environment}" preview for ${short}`;
  const statusesOf = async (/** @type {number} */ id) =>
    (
      await github.rest.repos.listDeploymentStatuses({
        ...context.repo,
        deployment_id: id,
        per_page: 100,
      })
    ).data;

  const deadline = now() + timeoutMs;
  /** @type {{ key: string, since: number } | null} */
  let canceled = null;
  while (now() < deadline) {
    const { data } = await github.rest.repos.listDeployments({
      ...context.repo,
      sha,
      environment,
      per_page: 10,
    });
    const deployments = data.filter(
      (/** @type {any} */ d) => d.creator?.login === VERCEL_BOT
    );
    // Only the newest deployment's statuses matter unless it was cancelled.
    if (deployments[0])
      deployments[0].statuses = await statusesOf(deployments[0].id);
    let verdict = decidePreview(deployments);
    if (verdict.kind === "canceled") {
      for (const older of deployments.slice(1, 5))
        older.statuses = await statusesOf(older.id);
      verdict = decidePreview(deployments);
    }

    if (verdict.kind === "ready") {
      const url = statusUrl(verdict.status);
      if (!url) {
        core.setFailed(
          `Vercel reported success for the ${label} but gave no URL.`
        );
        return;
      }
      core.info(
        `Vercel preview ready (deployment ${verdict.deployment.id}): ${url}`
      );
      core.setOutput("url", url);
      return;
    }
    if (verdict.kind === "failed") {
      const { status } = verdict;
      core.setFailed(
        `Vercel ${label} reported "${status.state}", so there is nothing to run E2E against. ` +
          `Vercel says: "${status.description || "(no description)"}". ` +
          `Deployment: ${status.log_url || statusUrl(status) || "(none)"}`
      );
      return;
    }
    if (verdict.kind === "canceled") {
      const key = `${verdict.deployment.id}:${verdict.status.id}`;
      if (canceled?.key !== key) canceled = { key, since: now() };
      const waited = now() - canceled.since;
      if (waited >= inactiveGraceMs) {
        core.setFailed(
          `Vercel cancelled the ${label} ("${verdict.status.description || "inactive"}") ` +
            `and no successful build followed within ${duration(inactiveGraceMs)}. ` +
            "If Vercel skipped the build (its ignoreCommand), there is no preview to test; " +
            "otherwise redeploy it in Vercel and re-run this job."
        );
        return;
      }
      core.info(
        `Deployment ${verdict.deployment.id} was cancelled; waiting for a rebuild ` +
          `(${duration(waited)} of ${duration(inactiveGraceMs)})…`
      );
    } else {
      canceled = null;
      core.info(`${verdict.reason}; waiting…`);
    }
    await sleep(intervalMs);
  }
  core.setFailed(
    `Timed out after ${duration(timeoutMs)} waiting for the ${label}.`
  );
}

module.exports = { decidePreview, waitForVercelPreview };
