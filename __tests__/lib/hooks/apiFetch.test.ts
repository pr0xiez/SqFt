import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/hooks/apiFetch";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("resolves with the parsed JSON body on a 200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, name: "Ada" }),
      })) as unknown as typeof fetch
    );

    await expect(apiFetch("/api/customers/1")).resolves.toEqual({
      id: 1,
      name: "Ada",
    });
  });

  it("passes the url and init through to fetch unchanged", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const init = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ada" }),
    };
    await apiFetch("/api/customers", init);

    expect(fetchMock).toHaveBeenCalledWith("/api/customers", init);
  });

  it("resolves with undefined on a 204 No Content response, without reading the body", async () => {
    const json = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 204,
        json,
      })) as unknown as typeof fetch
    );

    await expect(
      apiFetch("/api/estimates/1", { method: "DELETE" })
    ).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it("throws with the server's readApiError-derived message on a non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: "ESTIMATE_HAS_EVENTS",
            message: "Estimate has 2 scheduled job(s).",
          },
        }),
      })) as unknown as typeof fetch
    );

    await expect(
      apiFetch("/api/estimates/1", { method: "DELETE" })
    ).rejects.toThrow("Estimate has 2 scheduled job(s).");
  });

  it("falls back to the provided fallback message when the error body isn't the standard envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      })) as unknown as typeof fetch
    );

    await expect(
      apiFetch("/api/customers", undefined, "Failed to fetch customers")
    ).rejects.toThrow("Failed to fetch customers");
  });

  it("falls back to the default 'Request failed' message when no fallback is given", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => null,
      })) as unknown as typeof fetch
    );

    await expect(apiFetch("/api/customers")).rejects.toThrow("Request failed");
  });
});
