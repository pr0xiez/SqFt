import { describe, expect, it } from "vitest";
import { kebabSlug } from "@/lib/onboarding/slug";

describe("kebabSlug", () => {
  it("lowercases and dashes spaces", () => {
    expect(kebabSlug("Johnson Flooring Co.")).toBe("johnson-flooring-co");
  });

  it("collapses multiple spaces and punctuation", () => {
    expect(kebabSlug("  ABC   Inc., LLC  ")).toBe("abc-inc-llc");
  });

  it("strips non-ASCII", () => {
    expect(kebabSlug("Café & Floors")).toBe("caf-floors");
  });

  it("returns a fallback for all-non-ASCII input", () => {
    expect(kebabSlug("漢字")).toBe("org");
  });

  it("truncates to 60 chars max", () => {
    const long = "A".repeat(200);
    expect(kebabSlug(long).length).toBeLessThanOrEqual(60);
  });

  it("trims leading and trailing dashes", () => {
    expect(kebabSlug("-Foo-Bar-")).toBe("foo-bar");
  });
});
