import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("isSuperAdmin", () => {
  const ORIGINAL = process.env.SUPER_ADMIN_EMAILS;

  beforeEach(() => {
    delete process.env.SUPER_ADMIN_EMAILS;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SUPER_ADMIN_EMAILS;
    else process.env.SUPER_ADMIN_EMAILS = ORIGINAL;
  });

  async function load() {
    // Re-import so the module re-reads the env each test
    const mod = await import("@/lib/auth/superAdmin");
    return mod.isSuperAdmin;
  }

  it("returns false when the env var is unset", async () => {
    const isSuperAdmin = await load();
    expect(isSuperAdmin("anyone@example.com")).toBe(false);
  });

  it("returns false for empty input", async () => {
    process.env.SUPER_ADMIN_EMAILS = "alice@example.com";
    const isSuperAdmin = await load();
    expect(isSuperAdmin("")).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
  });

  it("returns true for an exact match", async () => {
    process.env.SUPER_ADMIN_EMAILS = "alice@example.com";
    const isSuperAdmin = await load();
    expect(isSuperAdmin("alice@example.com")).toBe(true);
  });

  it("is case-insensitive on both sides", async () => {
    process.env.SUPER_ADMIN_EMAILS = "Alice@Example.COM";
    const isSuperAdmin = await load();
    expect(isSuperAdmin("ALICE@example.com")).toBe(true);
  });

  it("supports comma-separated lists with surrounding whitespace", async () => {
    process.env.SUPER_ADMIN_EMAILS =
      "  alice@example.com , bob@example.com ,carol@example.com";
    const isSuperAdmin = await load();
    expect(isSuperAdmin("bob@example.com")).toBe(true);
    expect(isSuperAdmin("carol@example.com")).toBe(true);
    expect(isSuperAdmin("dave@example.com")).toBe(false);
  });

  it("ignores empty entries from a stray trailing comma", async () => {
    process.env.SUPER_ADMIN_EMAILS = "alice@example.com,,";
    const isSuperAdmin = await load();
    expect(isSuperAdmin("")).toBe(false);
    expect(isSuperAdmin("alice@example.com")).toBe(true);
  });
});
