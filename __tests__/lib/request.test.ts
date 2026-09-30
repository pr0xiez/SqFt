import { afterEach, describe, expect, it, vi } from "vitest";
import { getClientIp } from "@/lib/request";

afterEach(() => vi.unstubAllEnvs());

describe("audited client IP", () => {
  it("uses platform headers on Vercel instead of a forged XFF", () => {
    vi.stubEnv("VERCEL", "1");
    expect(
      getClientIp(
        new Headers({
          "x-vercel-forwarded-for": "203.0.113.9",
          "x-forwarded-for": "6.6.6.6",
        })
      )
    ).toBe("203.0.113.9");
    expect(
      getClientIp(
        new Headers({
          "x-real-ip": " 203.0.113.9 ",
          "x-forwarded-for": "6.6.6.6",
        })
      )
    ).toBe("203.0.113.9");
  });
  it("ignores forged platform headers outside Vercel and takes the appended XFF hop", () => {
    vi.stubEnv("VERCEL", "");
    expect(
      getClientIp(
        new Headers({
          "x-vercel-forwarded-for": "6.6.6.6",
          "x-real-ip": "7.7.7.7",
          "x-forwarded-for": "1.2.3.4, 198.51.100.7",
        })
      )
    ).toBe("198.51.100.7");
    expect(getClientIp(new Headers({ "x-real-ip": "7.7.7.7" }))).toBeNull();
  });
  it("normalizes blank and unknown addresses across the fallback chain", () => {
    vi.stubEnv("VERCEL", "1");
    expect(getClientIp(new Headers())).toBeNull();
    expect(
      getClientIp(
        new Headers({
          "x-vercel-forwarded-for": " ",
          "x-real-ip": "unknown",
          "x-forwarded-for": " ",
        })
      )
    ).toBeNull();
    expect(
      getClientIp(
        new Headers({
          "x-vercel-forwarded-for": " ",
          "x-real-ip": "1.2.3.4, 203.0.113.9",
        })
      )
    ).toBe("203.0.113.9");
  });
});
