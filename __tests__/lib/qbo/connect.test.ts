import { afterEach, describe, expect, it, vi } from "vitest";
import type { QboConfig } from "@/lib/qbo/config";
import {
  buildAuthorizeUrl,
  exchangeRefreshToken,
  QboAuthDeadError,
  STATE_TTL_MS,
  shouldRefresh,
  signState,
  verifyState,
} from "@/lib/qbo/connect";

afterEach(() => {
  vi.unstubAllGlobals();
});

const config: QboConfig = {
  clientId: "cid",
  clientSecret: "csecret",
  environment: "sandbox",
  authorizeUrl: "https://auth.example/connect",
  tokenUrl: "https://auth.example/token",
  revokeUrl: "https://auth.example/revoke",
  apiBaseUrl: "https://qbo.example",
};

describe("oauth state", () => {
  it("round-trips the orgId through sign/verify", () => {
    const state = signState("org_abc", "secret");
    expect(verifyState(state, "secret")).toBe("org_abc");
  });

  it("rejects tampered and wrong-secret states", () => {
    const state = signState("org_abc", "secret");
    expect(verifyState(`${state}x`, "secret")).toBeNull();
    expect(verifyState(state.replace("org_abc", "org_evil"), "secret")).toBe(
      null
    );
    expect(verifyState(state, "other")).toBeNull();
    expect(verifyState("garbage", "secret")).toBeNull();
  });

  it("rejects a replayed state past the TTL (and one from the future)", () => {
    const issued = Date.now();
    const state = signState("org_abc", "secret", issued);
    expect(verifyState(state, "secret", issued + STATE_TTL_MS - 1000)).toBe(
      "org_abc"
    );
    expect(
      verifyState(state, "secret", issued + STATE_TTL_MS + 1000)
    ).toBeNull();
    expect(verifyState(state, "secret", issued - 120_000)).toBeNull();
  });
});

describe("buildAuthorizeUrl", () => {
  it("carries client_id, scope, redirect and state", () => {
    const url = new URL(
      buildAuthorizeUrl({
        config,
        redirectUri: "https://app.example/api/qbo/callback",
        state: "the-state",
      })
    );
    expect(url.origin + url.pathname).toBe("https://auth.example/connect");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe(
      "com.intuit.quickbooks.accounting"
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example/api/qbo/callback"
    );
    expect(url.searchParams.get("state")).toBe("the-state");
  });
});

describe("shouldRefresh", () => {
  it("refreshes within the 5-minute skew, not before", () => {
    const now = new Date("2026-07-24T12:00:00Z");
    expect(shouldRefresh(now, new Date("2026-07-24T12:04:00Z"))).toBe(true);
    expect(shouldRefresh(now, new Date("2026-07-24T11:00:00Z"))).toBe(true);
    expect(shouldRefresh(now, new Date("2026-07-24T12:30:00Z"))).toBe(false);
  });
});

describe("exchangeRefreshToken", () => {
  it("returns the rotated pair on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "new-refresh",
            expires_in: 3600,
            x_refresh_token_expires_in: 86400,
          }),
          { status: 200 }
        )
      )
    );
    const tokens = await exchangeRefreshToken(config, "old-refresh");
    expect(tokens).toEqual({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresIn: 3600,
      refreshExpiresIn: 86400,
    });
  });

  it("throws QboAuthDeadError on invalid_grant (the connection is dead)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid_grant" }), {
          status: 400,
        })
      )
    );
    await expect(exchangeRefreshToken(config, "dead")).rejects.toBeInstanceOf(
      QboAuthDeadError
    );
  });

  it("throws a plain (retryable) error on a 5xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("oops", { status: 503 }))
    );
    const err = await exchangeRefreshToken(config, "r").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(QboAuthDeadError);
  });
});
