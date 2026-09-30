import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logError,
  logMutation,
  logRequest,
  maskTokenPath,
} from "../../lib/logger";

function captureOutput() {
  const lines: string[] = [];
  const spy = vi.spyOn(console, "log").mockImplementation((chunk) => {
    lines.push(String(chunk));
  });
  return { lines, spy };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logRequest", () => {
  it("writes a JSON line with type=request and all required fields", () => {
    const { lines } = captureOutput();

    logRequest({
      method: "GET",
      path: "/api/customers",
      status: 200,
      durationMs: 42,
      orgId: "org1",
    });

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.type).toBe("request");
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/api/customers");
    expect(entry.status).toBe(200);
    expect(entry.durationMs).toBe(42);
    expect(entry.orgId).toBe("org1");
    expect(entry.ts).toBeDefined();
    expect(entry.env).toBeDefined();
  });

  it("does not include PII fields", () => {
    const { lines } = captureOutput();

    logRequest({
      method: "POST",
      path: "/api/customers",
      status: 201,
      durationMs: 10,
      orgId: "org1",
    });

    const entry = JSON.parse(lines[0]);
    expect(entry).not.toHaveProperty("name");
    expect(entry).not.toHaveProperty("email");
    expect(entry).not.toHaveProperty("phone");
    expect(entry).not.toHaveProperty("body");
  });
});

describe("logMutation", () => {
  it("writes a JSON line with type=mutation and derives resource from path", () => {
    const { lines } = captureOutput();

    logMutation({
      method: "POST",
      path: "/api/customers",
      status: 201,
      orgId: "org1",
    });

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.type).toBe("mutation");
    expect(entry.resource).toBe("customers");
    expect(entry.method).toBe("POST");
    expect(entry.orgId).toBe("org1");
  });

  it("extracts resource from dynamic route paths", () => {
    const { lines } = captureOutput();

    logMutation({
      method: "PATCH",
      path: "/api/site-measures/42",
      status: 200,
      orgId: "org1",
    });

    const entry = JSON.parse(lines[0]);
    expect(entry.resource).toBe("site-measures");
  });
});

describe("logError", () => {
  it("writes a JSON line with type=error", () => {
    const { lines } = captureOutput();

    logError({
      method: "PATCH",
      path: "/api/site-measures/1",
      orgId: "org1",
      errorMessage: "DB failure",
    });

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.type).toBe("error");
    expect(entry.method).toBe("PATCH");
    expect(entry.errorMessage).toBe("DB failure");
  });

  it("calls console.error when err is provided", () => {
    captureOutput();
    const err = new Error("boom");

    logError({ errorMessage: "boom", err });

    expect(console.error).toHaveBeenCalledWith(err);
  });

  it("does not call console.error when err is absent", () => {
    captureOutput();

    logError({ errorMessage: "no err object" });

    expect(console.error).not.toHaveBeenCalled();
  });

  it("works with partial context (no method/path)", () => {
    const { lines } = captureOutput();

    logError({ errorMessage: "signup failed" });

    const entry = JSON.parse(lines[0]);
    expect(entry.type).toBe("error");
    expect(entry.errorMessage).toBe("signup failed");
  });
});

describe("maskTokenPath", () => {
  it("redacts the token segment on an estimate-review API path", () => {
    expect(maskTokenPath("/api/estimate-review/SECRET_TOKEN_123/approve")).toBe(
      "/api/estimate-review/[REDACTED]/approve"
    );
  });

  it("redacts the token segment on an invoice-review API path", () => {
    expect(maskTokenPath("/api/invoice-review/SECRET_TOKEN_456/checkout")).toBe(
      "/api/invoice-review/[REDACTED]/checkout"
    );
  });

  it("redacts the token on the public page path (no /api prefix)", () => {
    expect(maskTokenPath("/estimate-review/SECRET_TOKEN_789")).toBe(
      "/estimate-review/[REDACTED]"
    );
  });

  it("redacts the token on an invoice-review confirm path", () => {
    expect(maskTokenPath("/api/invoice-review/SECRET_TOKEN_ABC/confirm")).toBe(
      "/api/invoice-review/[REDACTED]/confirm"
    );
  });

  it("never includes the raw token value in the masked output", () => {
    const masked = maskTokenPath(
      "/api/estimate-review/super-secret-token-xyz/decline"
    );
    expect(masked).not.toContain("super-secret-token-xyz");
  });

  it("leaves ordinary org-scoped API paths completely unchanged", () => {
    expect(maskTokenPath("/api/estimates/5")).toBe("/api/estimates/5");
    expect(maskTokenPath("/api/customers")).toBe("/api/customers");
    expect(maskTokenPath("/api/site-measures/42")).toBe(
      "/api/site-measures/42"
    );
  });

  it("leaves an estimate-review path with no trailing token segment unchanged", () => {
    expect(maskTokenPath("/api/estimate-review")).toBe("/api/estimate-review");
  });
});
