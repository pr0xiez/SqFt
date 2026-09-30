/** Tier C: the cron sweeper's bearer gate (GET /api/qbo/sync/run). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route wrapper pulls @/lib/auth (next-auth), which doesn't resolve in
// the vitest node environment — mock it like every other route test.
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/qbo/runner", () => ({
  runQboSweep: vi.fn().mockResolvedValue({ orgs: 1, done: 2, failed: 0 }),
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import { GET } from "@/app/api/qbo/sync/run/route";
import { runQboSweep } from "@/lib/qbo/runner";
import { makeRequest, noParams } from "./_helpers";

const prevSecret = process.env.CRON_SECRET;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "cron-secret";
});
afterEach(() => {
  if (prevSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = prevSecret;
});

function requestWithAuth(header?: string) {
  const req = makeRequest("GET", "http://localhost/api/qbo/sync/run");
  if (header) req.headers.set("authorization", header);
  return req;
}

describe("GET /api/qbo/sync/run", () => {
  it("401s without the bearer and with a wrong bearer", async () => {
    expect((await GET(requestWithAuth(), noParams)).status).toBe(401);
    expect((await GET(requestWithAuth("Bearer nope"), noParams)).status).toBe(
      401
    );
    expect(vi.mocked(runQboSweep)).not.toHaveBeenCalled();
  });

  it("401s everything when CRON_SECRET is unset (fail closed)", async () => {
    delete process.env.CRON_SECRET;
    expect(
      (await GET(requestWithAuth("Bearer cron-secret"), noParams)).status
    ).toBe(401);
  });

  it("sweeps with the correct bearer", async () => {
    const res = await GET(requestWithAuth("Bearer cron-secret"), noParams);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orgs: 1, done: 2, failed: 0 });
  });
});
