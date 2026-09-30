import { describe, expect, it } from "vitest";
import { clientMetaFromHeaders } from "@/lib/http/clientMeta";

describe("clientMetaFromHeaders", () => {
  it("uses the same nullable metadata contract for requests and pages", () => {
    expect(clientMetaFromHeaders(new Headers())).toEqual({
      ip: null,
      userAgent: null,
    });
    expect(
      clientMetaFromHeaders(
        new Headers({ "x-forwarded-for": "unknown", "user-agent": " " })
      )
    ).toEqual({ ip: null, userAgent: null });
  });

  it("extracts the first forwarded address and user-agent", () => {
    expect(
      clientMetaFromHeaders(
        new Headers({
          "x-forwarded-for": "192.0.2.1, 192.0.2.2",
          "user-agent": "browser",
        })
      )
    ).toEqual({ ip: "192.0.2.1", userAgent: "browser" });
  });
});
