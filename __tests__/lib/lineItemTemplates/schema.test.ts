import { describe, expect, it } from "vitest";
import {
  lineItemTemplateCreateSchema,
  lineItemTemplateUpdateSchema,
} from "@/lib/lineItemTemplates/schema";

describe("lineItemTemplateCreateSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({ name: "Hardwood install" })
        .success
    ).toBe(true);
  });

  it("accepts a fully populated payload", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({
        name: "Hardwood install",
        description: "Solid oak plank",
        rate: 5.5,
        unitLabel: "sqft",
      }).success
    ).toBe(true);
  });

  it("rejects a missing name", () => {
    expect(lineItemTemplateCreateSchema.safeParse({}).success).toBe(false);
  });

  it("rejects an empty name (below the 1-char minimum)", () => {
    expect(lineItemTemplateCreateSchema.safeParse({ name: "" }).success).toBe(
      false
    );
  });

  it("accepts a name at the 200-char maximum", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({ name: "a".repeat(200) }).success
    ).toBe(true);
  });

  it("rejects a name over the 200-char maximum", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({ name: "a".repeat(201) }).success
    ).toBe(false);
  });

  it("accepts description as null (nullish)", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({
        name: "x",
        description: null,
      }).success
    ).toBe(true);
  });

  it("allows omitting description entirely", () => {
    expect(lineItemTemplateCreateSchema.safeParse({ name: "x" }).success).toBe(
      true
    );
  });

  it("accepts description at the 2000-char maximum", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({
        name: "x",
        description: "d".repeat(2000),
      }).success
    ).toBe(true);
  });

  it("rejects description over the 2000-char maximum", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({
        name: "x",
        description: "d".repeat(2001),
      }).success
    ).toBe(false);
  });

  it("accepts rate of 0 (boundary)", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({ name: "x", rate: 0 }).success
    ).toBe(true);
  });

  it("rejects a negative rate", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({ name: "x", rate: -0.01 }).success
    ).toBe(false);
  });

  it("allows omitting rate entirely", () => {
    expect(lineItemTemplateCreateSchema.safeParse({ name: "x" }).success).toBe(
      true
    );
  });

  it("accepts unitLabel at the 40-char maximum", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({
        name: "x",
        unitLabel: "u".repeat(40),
      }).success
    ).toBe(true);
  });

  it("rejects unitLabel over the 40-char maximum", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({
        name: "x",
        unitLabel: "u".repeat(41),
      }).success
    ).toBe(false);
  });

  it("accepts an empty-string unitLabel (0 lower bound)", () => {
    expect(
      lineItemTemplateCreateSchema.safeParse({ name: "x", unitLabel: "" })
        .success
    ).toBe(true);
  });
});

describe("lineItemTemplateUpdateSchema", () => {
  it("accepts an empty patch (every field optional)", () => {
    expect(lineItemTemplateUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("rejects an empty-string name if provided", () => {
    expect(lineItemTemplateUpdateSchema.safeParse({ name: "" }).success).toBe(
      false
    );
  });

  it("rejects a name over the 200-char maximum", () => {
    expect(
      lineItemTemplateUpdateSchema.safeParse({ name: "a".repeat(201) }).success
    ).toBe(false);
  });

  it("rejects a negative rate", () => {
    expect(lineItemTemplateUpdateSchema.safeParse({ rate: -1 }).success).toBe(
      false
    );
  });

  it("accepts description as null", () => {
    expect(
      lineItemTemplateUpdateSchema.safeParse({ description: null }).success
    ).toBe(true);
  });

  it("rejects unitLabel over the 40-char maximum", () => {
    expect(
      lineItemTemplateUpdateSchema.safeParse({ unitLabel: "u".repeat(41) })
        .success
    ).toBe(false);
  });

  it("accepts an archived boolean", () => {
    expect(
      lineItemTemplateUpdateSchema.safeParse({ archived: true }).success
    ).toBe(true);
  });

  it("rejects a non-integer sortOrder", () => {
    expect(
      lineItemTemplateUpdateSchema.safeParse({ sortOrder: 1.5 }).success
    ).toBe(false);
  });

  it("accepts an integer sortOrder", () => {
    expect(
      lineItemTemplateUpdateSchema.safeParse({ sortOrder: 3 }).success
    ).toBe(true);
  });
});
