import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/request";

function headersWith(record: Record<string, string>): Headers {
  return new Headers(record);
}

describe("getClientIp", () => {
  it("prefers x-vercel-forwarded-for over a spoofed x-forwarded-for", () => {
    const headers = headersWith({
      "x-vercel-forwarded-for": "203.0.113.9",
      "x-forwarded-for": "6.6.6.6, 203.0.113.9",
    });
    expect(getClientIp(headers)).toBe("203.0.113.9");
  });

  it("takes the first entry of a comma-separated x-vercel-forwarded-for", () => {
    const headers = headersWith({
      "x-vercel-forwarded-for": "203.0.113.9, 70.41.3.18",
    });
    expect(getClientIp(headers)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip when x-vercel-forwarded-for is absent", () => {
    const headers = headersWith({
      "x-real-ip": "198.51.100.7",
      "x-forwarded-for": "6.6.6.6",
    });
    expect(getClientIp(headers)).toBe("198.51.100.7");
  });

  it("falls back to x-forwarded-for as a last resort (e.g. local dev)", () => {
    const headers = headersWith({ "x-forwarded-for": "127.0.0.1" });
    expect(getClientIp(headers)).toBe("127.0.0.1");
  });

  it("takes the first entry of a comma-separated x-forwarded-for fallback", () => {
    const headers = headersWith({
      "x-forwarded-for": "198.51.100.1, 10.0.0.1",
    });
    expect(getClientIp(headers)).toBe("198.51.100.1");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    const headers = headersWith({});
    expect(getClientIp(headers)).toBe("unknown");
  });

  it("works against a plain Request's headers", () => {
    const req = new Request("http://x/", {
      headers: {
        "x-vercel-forwarded-for": "203.0.113.9",
        "x-forwarded-for": "6.6.6.6",
      },
    });
    expect(getClientIp(req.headers)).toBe("203.0.113.9");
  });
});
