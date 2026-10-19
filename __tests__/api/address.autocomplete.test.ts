import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const env = { GEOAPIFY_API_KEY: "test-key" as string | undefined };
vi.mock("@/lib/env", () => ({ getEnv: () => env }));

vi.mock("next/server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("next/server")>();
  return { ...mod, after: vi.fn((cb: () => void) => cb()) };
});

import type { Session } from "next-auth";
import { GET } from "@/app/api/address/autocomplete/route";
import { auth } from "@/lib/auth";
import { makeRequest, noParams } from "./_helpers";

const mockAuth = vi.mocked(auth) as unknown as ReturnType<
  typeof vi.fn<() => Promise<Session | null>>
>;

function asRole(role: "admin" | "lead" | "crew") {
  const stub = { user: { id: "u1", orgId: "org1", role } };
  // biome-ignore lint/suspicious/noExplicitAny: test stub session
  mockAuth.mockResolvedValue(stub as any);
}

const call = (qs = "") =>
  GET(
    makeRequest("GET", `http://localhost/api/address/autocomplete${qs}`),
    noParams
  );

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  env.GEOAPIFY_API_KEY = "test-key";
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/address/autocomplete — auth gate", () => {
  it("401 when unauthenticated, without calling upstream", async () => {
    mockAuth.mockResolvedValue(null);
    const res = await call("?q=123 main st");
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("403 for crew, without calling upstream", async () => {
    asRole("crew");
    const res = await call("?q=123 main st");
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["lead", "admin"] as const)("200 for %s", async (role) => {
    asRole(role);
    fetchMock.mockResolvedValue(Response.json({ results: [] }));
    const res = await call("?q=123 main st");
    expect(res.status).toBe(200);
  });
});

describe("GET /api/address/autocomplete — behavior", () => {
  beforeEach(() => asRole("lead"));

  it("forwards q upstream and returns mapped suggestions", async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        results: [
          {
            housenumber: "123",
            street: "Main St",
            city: "Austin",
            state_code: "TX",
            postcode: "78701",
            lat: 30.1,
            lon: -97.7,
            formatted: "123 Main St, Austin, TX 78701",
          },
        ],
      })
    );
    const res = await call("?q=123%20Main%20St");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        formatted: "123 Main St, Austin, TX 78701",
        street: "123 Main St",
        unit: "",
        city: "Austin",
        state: "TX",
        postalCode: "78701",
        lat: 30.1,
        lon: -97.7,
      },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("text")).toBe("123 Main St");
  });

  it("missing q defaults to empty: returns [] with no upstream call", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/address/autocomplete — fail-safe contract", () => {
  beforeEach(() => asRole("lead"));

  it("returns [] when the API key is unset", async () => {
    env.GEOAPIFY_API_KEY = undefined;
    const res = await call("?q=123 main st");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] when the upstream request rejects", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const res = await call("?q=123 main st");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns [] when upstream responds non-ok", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 503 }));
    const res = await call("?q=123 main st");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns [] when upstream returns malformed JSON", async () => {
    fetchMock.mockResolvedValue(new Response("not json", { status: 200 }));
    const res = await call("?q=123 main st");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
