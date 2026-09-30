import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { parseRouteId } = await import("@/lib/routeParams");

describe("parseRouteId", () => {
  it("parses a valid positive integer segment", () => {
    expect(parseRouteId("42")).toBe(42);
  });

  it("calls notFound() for a non-numeric segment", () => {
    expect(() => parseRouteId("abc")).toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound() for a negative id", () => {
    expect(() => parseRouteId("-1")).toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound() for zero", () => {
    expect(() => parseRouteId("0")).toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound() for a fractional id", () => {
    expect(() => parseRouteId("1.5")).toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound() for an empty string", () => {
    expect(() => parseRouteId("")).toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound() for a numeric-looking string with trailing garbage", () => {
    expect(() => parseRouteId("42abc")).toThrow("NEXT_NOT_FOUND");
  });
});
