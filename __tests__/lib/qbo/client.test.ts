import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyFault, QboApiError, qboFetch } from "@/lib/qbo/client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function fault(code: string, message = "msg", detail = "detail") {
  return { Fault: { Error: [{ code, Message: message, Detail: detail }] } };
}

describe("classifyFault", () => {
  it("maps Intuit fault codes to kinds", () => {
    expect(classifyFault(401, null)).toBe("auth");
    expect(classifyFault(403, null)).toBe("other");
    expect(classifyFault(403, fault("3200"))).toBe("auth");
    expect(
      classifyFault(403, fault("003100", "ApplicationAuthorizationFailed"))
    ).toBe("other");
    expect(classifyFault(429, null)).toBe("throttle");
    expect(classifyFault(400, fault("6240"))).toBe("duplicate_name");
    expect(classifyFault(400, fault("6140"))).toBe("duplicate_docnum");
    expect(classifyFault(400, fault("5010"))).toBe("stale_object");
    expect(classifyFault(400, fault("610"))).toBe("not_found");
    expect(classifyFault(400, fault("2500"))).toBe("validation");
    expect(classifyFault(500, null)).toBe("other");
  });
});

describe("qboFetch", () => {
  it("passes preview protection only to our mock provider and refuses redirects", async () => {
    vi.stubEnv("QBO_ENVIRONMENT", "mock");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("PUBLIC_BASE_URL", "https://review.example");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "test-bypass");
    const fetchMock = vi.fn().mockImplementation(async (_url, init) => {
      expect(init.headers["x-vercel-protection-bypass"]).toBe("test-bypass");
      expect(init.redirect).toBe("error");
      return Response.json({ Invoice: { Id: "7", Balance: 20 } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await qboFetch({
      accessToken: "mock",
      realmId: "mock",
      apiBaseUrl: "https://review.example/api/qbo-mock",
      method: "GET",
      path: "/invoice/7",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  const base = {
    accessToken: "tok",
    realmId: "realm1",
    apiBaseUrl: "https://qbo.example",
  } as const;

  it("pins minorversion=75, sends auth, and returns the parsed body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ Customer: { Id: "1" } }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const body = await qboFetch({
      ...base,
      method: "POST",
      path: "/customer",
      body: { DisplayName: "Sam" },
    });
    expect(body).toEqual({ Customer: { Id: "1" } });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toContain(
      "https://qbo.example/v3/company/realm1/customer"
    );
    expect(url.searchParams.get("minorversion")).toBe("75");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer tok"
    );
  });

  it("throws a typed QboApiError from a Fault envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(fault("5010", "Stale")), { status: 400 })
        )
    );
    const err = (await qboFetch({
      ...base,
      method: "POST",
      path: "/invoice",
      body: {},
    }).catch((e) => e)) as QboApiError;
    expect(err).toBeInstanceOf(QboApiError);
    expect(err.kind).toBe("stale_object");
    expect(err.faultCode).toBe("5010");
    expect(err.message).toBe("Stale");
  });

  it("classifies a 401 with a non-JSON body as auth", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 401 }))
    );
    const err = (await qboFetch({
      ...base,
      method: "GET",
      path: "/query",
      query: { query: "select * from Customer" },
    }).catch((e) => e)) as QboApiError;
    expect(err).toBeInstanceOf(QboApiError);
    expect(err.kind).toBe("auth");
  });
});
