import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { create: vi.fn() },
    crewMember: { findMany: vi.fn() },
  },
}));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { POST } from "@/app/api/events/route";
import { auth } from "@/lib/auth";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;

function asRole(role: "admin" | "lead" | "crew") {
  const stub = { user: { id: "u1", orgId: "org1", role } };
  // biome-ignore lint/suspicious/noExplicitAny: test stub session
  mockAuth.mockResolvedValue(stub as any);
}

function makePost() {
  const req = new Request("http://localhost/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "job",
      title: "Install day",
      date: "2026-06-01",
      startTime: "08:00",
      endTime: "17:00",
    }),
  });
  Object.defineProperty(req, "nextUrl", {
    value: new URL("http://localhost/api/events"),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest duck-typing
  return req as any as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/events — role gate", () => {
  it("401 for crew", async () => {
    asRole("crew");
    const res = await POST(makePost(), { params: Promise.resolve({}) });
    expect(res.status).toBe(401);
  });

  it("passes the gate for lead", async () => {
    asRole("lead");
    const res = await POST(makePost(), { params: Promise.resolve({}) });
    expect(res.status).not.toBe(401);
  });
});
