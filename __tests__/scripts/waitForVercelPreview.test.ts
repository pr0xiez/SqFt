import { describe, expect, it } from "vitest";
import {
  decidePreview,
  waitForVercelPreview,
} from "@/scripts/wait-for-vercel-preview.cjs";

type Status = {
  id: number;
  state: string;
  description?: string;
  environment_url?: string;
  log_url?: string;
};

const st = (id: number, state: string, url = `https://dpl-${id}.vercel.app`) =>
  ({
    id,
    state,
    description:
      state === "inactive" ? "Canceled from the Vercel Dashboard" : state,
    environment_url: url,
    log_url: url,
  }) satisfies Status;

describe("decidePreview", () => {
  it("waits when there is no deployment or no status yet", () => {
    expect(decidePreview([]).kind).toBe("waiting");
    expect(decidePreview([{ id: 1, statuses: [] }]).kind).toBe("waiting");
    expect(decidePreview([{ id: 1, statuses: [st(1, "pending")] }]).kind).toBe(
      "waiting"
    );
  });

  it("fails on failure or error", () => {
    for (const state of ["failure", "error"]) {
      expect(decidePreview([{ id: 1, statuses: [st(1, state)] }]).kind).toBe(
        "failed"
      );
    }
  });

  it("is ready on inactive → success (Vercel cancel then rebuild), using the success URL", () => {
    const v = decidePreview([
      {
        id: 1,
        statuses: [
          st(2, "success", "https://good"),
          st(1, "inactive", "https://cancelled"),
        ],
      },
    ]);
    expect(v).toMatchObject({
      kind: "ready",
      status: { environment_url: "https://good" },
    });
  });

  it("is ready on success → inactive (superseded later)", () => {
    const v = decidePreview([
      {
        id: 1,
        statuses: [st(2, "inactive"), st(1, "success", "https://good")],
      },
    ]);
    expect(v).toMatchObject({
      kind: "ready",
      status: { environment_url: "https://good" },
    });
  });

  it("lets a newer failure on the same deployment win over an older success", () => {
    expect(
      decidePreview([{ id: 1, statuses: [st(2, "failure"), st(1, "success")] }])
        .kind
    ).toBe("failed");
  });

  it("falls back to an older successful deployment of the same commit when the newest was cancelled", () => {
    const v = decidePreview([
      { id: 2, statuses: [st(20, "inactive")] },
      { id: 1, statuses: [st(10, "success", "https://older")] },
    ]);
    expect(v).toMatchObject({ kind: "ready", deployment: { id: 1 } });
  });

  it("reports a cancelled-only deployment as canceled", () => {
    expect(decidePreview([{ id: 1, statuses: [st(1, "inactive")] }]).kind).toBe(
      "canceled"
    );
  });
});

describe("waitForVercelPreview", () => {
  // Each poll returns the next scripted snapshot (the last one repeats).
  function run(snapshots: Array<Array<{ id: number; statuses: Status[] }>>) {
    let t = 0;
    let poll = 0;
    const out: Record<string, string> = {};
    const result: { failed?: string; info: string[] } = { info: [] };
    const current = () => snapshots[Math.min(poll, snapshots.length - 1)];
    const github = {
      rest: {
        repos: {
          listDeployments: async () => ({
            data: current().map((d) => ({
              id: d.id,
              creator: { login: "vercel[bot]" },
            })),
          }),
          listDeploymentStatuses: async ({
            deployment_id,
          }: {
            deployment_id: number;
          }) => ({
            data: current().find((d) => d.id === deployment_id)?.statuses ?? [],
          }),
        },
      },
    };
    const core = {
      info: (m: string) => result.info.push(m),
      setFailed: (m: string) => {
        result.failed = m;
      },
      setOutput: (k: string, v: string) => {
        out[k] = v;
      },
    };
    return waitForVercelPreview({
      github,
      context: { repo: { owner: "o", repo: "r" } },
      core,
      environment: "Preview – sqft",
      sha: "abcdef1234",
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
        poll += 1;
      },
    }).then(() => ({ ...result, out, elapsedMs: t }));
  }

  it("fails on the first poll when the preview build failed", async () => {
    const r = await run([[{ id: 1, statuses: [st(1, "failure")] }]]);
    expect(r.elapsedMs).toBe(0);
    expect(r.failed).toMatch(/reported "failure".*Deployment: https:\/\/dpl-1/);
    expect(r.out.url).toBeUndefined();
  });

  it("waits through cancel → rebuild and outputs the rebuilt URL (PR #369's sequence)", async () => {
    const cancelled = st(1, "inactive", "https://cancelled");
    const r = await run([
      [{ id: 1, statuses: [cancelled] }],
      [{ id: 1, statuses: [cancelled] }],
      [{ id: 1, statuses: [st(2, "success", "https://rebuilt"), cancelled] }],
    ]);
    expect(r.failed).toBeUndefined();
    expect(r.out.url).toBe("https://rebuilt");
  });

  it("is ready immediately when a success was later superseded by inactive", async () => {
    const r = await run([
      [
        {
          id: 1,
          statuses: [st(2, "inactive"), st(1, "success", "https://up")],
        },
      ],
    ]);
    expect(r).toMatchObject({ elapsedMs: 0, out: { url: "https://up" } });
  });

  it("picks up a newer deployment for the same commit", async () => {
    const r = await run([
      [{ id: 1, statuses: [st(1, "inactive")] }],
      [
        { id: 2, statuses: [st(2, "success", "https://newer")] },
        { id: 1, statuses: [st(1, "inactive")] },
      ],
    ]);
    expect(r.out.url).toBe("https://newer");
  });

  it("fails with a clear message ~3 min after a cancel with no rebuild, not after 10", async () => {
    const r = await run([[{ id: 1, statuses: [st(1, "inactive")] }]]);
    expect(r.elapsedMs).toBe(3 * 60 * 1000);
    expect(r.failed).toMatch(
      /cancelled the "Preview – sqft" preview for abcdef1.*within 3 min/
    );
  });

  it("times out after 10 min when the build never finishes", async () => {
    const r = await run([[{ id: 1, statuses: [st(1, "pending")] }]]);
    expect(r.elapsedMs).toBe(10 * 60 * 1000);
    expect(r.failed).toMatch(/Timed out after 10 min/);
  });
});
