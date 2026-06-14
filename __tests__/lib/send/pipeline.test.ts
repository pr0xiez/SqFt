import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  EmailFailedError,
  NotFoundError,
} from "@/lib/api/errors";
import {
  runSendPipeline,
  type Sendable,
  type SendRequest,
} from "@/lib/send/pipeline";

vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));
const { logError } = await import("@/lib/logger");

type FakeDoc = { id: number; token: string | null };

const baseReq: SendRequest = {
  to: "customer@example.com",
  subject: "Estimate #5001",
  sender: { email: "lead@org.com", name: "Lead" },
};

function fake(overrides: Partial<Sendable<FakeDoc, string>> = {}) {
  const calls: string[] = [];
  const sendable: Sendable<FakeDoc, string> = {
    load: async () => {
      calls.push("load");
      return { id: 7, token: "tok-1" };
    },
    guard: () => {
      calls.push("guard");
    },
    currentToken: (doc) => doc.token,
    rotateToken: async () => {
      calls.push("rotate");
      return "tok-2";
    },
    onTokenRotated: async () => {
      calls.push("rotated");
    },
    publicPath: (token) => `/fake-review/${token}`,
    prepare: (_doc, publicUrl) => {
      calls.push("prepare");
      return publicUrl;
    },
    sendEmail: async () => {
      calls.push("email");
      return { ok: true };
    },
    markSent: async () => {
      calls.push("markSent");
      return true;
    },
    ...overrides,
  };
  return { sendable, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_BASE_URL = "https://app.test";
});

describe("runSendPipeline", () => {
  it("runs the spine in order and skips rotation when a token exists", async () => {
    const { sendable, calls } = fake();
    await runSendPipeline(sendable, 7, "org1", baseReq);
    expect(calls).toEqual(["load", "guard", "prepare", "email", "markSent"]);
  });

  it("builds the public URL from the base URL and publicPath", async () => {
    let seenUrl: string | undefined;
    const { sendable } = fake({
      prepare: (_doc, publicUrl) => {
        seenUrl = publicUrl;
        return publicUrl;
      },
    });
    await runSendPipeline(sendable, 7, "org1", baseReq);
    expect(seenUrl).toBe("https://app.test/fake-review/tok-1");
  });

  it("rotates on regenerateLink and fires onTokenRotated before the email", async () => {
    let seenUrl: string | undefined;
    const { sendable, calls } = fake({
      prepare: (_doc, publicUrl) => {
        calls.push("prepare");
        seenUrl = publicUrl;
        return publicUrl;
      },
    });
    await runSendPipeline(sendable, 7, "org1", {
      ...baseReq,
      regenerateLink: true,
    });
    expect(calls).toEqual([
      "load",
      "guard",
      "rotate",
      "rotated",
      "prepare",
      "email",
      "markSent",
    ]);
    expect(seenUrl).toBe("https://app.test/fake-review/tok-2");
  });

  it("rotates when the document has no token yet", async () => {
    const { sendable, calls } = fake({
      load: async () => ({ id: 7, token: null }),
    });
    await runSendPipeline(sendable, 7, "org1", baseReq);
    expect(calls).toContain("rotate");
    expect(calls).toContain("rotated");
  });

  it("throws NotFoundError when load misses and runs nothing else", async () => {
    const { sendable, calls } = fake({ load: async () => null });
    await expect(runSendPipeline(sendable, 7, "org1", baseReq)).rejects.toThrow(
      NotFoundError
    );
    expect(calls).toEqual([]);
  });

  it("a guard rejection blocks rotation and email", async () => {
    const { sendable, calls } = fake({
      guard: () => {
        throw new ConflictError("locked");
      },
      load: async () => ({ id: 7, token: null }),
    });
    await expect(runSendPipeline(sendable, 7, "org1", baseReq)).rejects.toThrow(
      ConflictError
    );
    expect(calls).not.toContain("rotate");
    expect(calls).not.toContain("email");
  });

  it("throws NotFoundError when rotation misses, before any email", async () => {
    const { sendable, calls } = fake({ rotateToken: async () => null });
    await expect(
      runSendPipeline(sendable, 7, "org1", { ...baseReq, regenerateLink: true })
    ).rejects.toThrow(NotFoundError);
    expect(calls).not.toContain("email");
  });

  it("aborts before the email when onTokenRotated fails", async () => {
    const { sendable, calls } = fake({
      onTokenRotated: async () => {
        throw new Error("audit write failed");
      },
    });
    await expect(
      runSendPipeline(sendable, 7, "org1", { ...baseReq, regenerateLink: true })
    ).rejects.toThrow("audit write failed");
    expect(calls).not.toContain("email");
    expect(calls).not.toContain("markSent");
  });

  it("translates a failed email to EmailFailedError and never marks sent", async () => {
    const { sendable, calls } = fake({
      sendEmail: async () => ({ ok: false, error: "boom" }),
    });
    await expect(runSendPipeline(sendable, 7, "org1", baseReq)).rejects.toThrow(
      EmailFailedError
    );
    expect(calls).not.toContain("markSent");
  });

  it("defaults the EmailFailedError message when the email port gives none", async () => {
    const { sendable } = fake({ sendEmail: async () => ({ ok: false }) });
    await expect(runSendPipeline(sendable, 7, "org1", baseReq)).rejects.toThrow(
      "Email failed"
    );
  });

  it("passes the same prepared value to the email and to markSent", async () => {
    const prepared = { payload: "x" };
    const emailed: unknown[] = [];
    const marked: unknown[] = [];
    const { sendable } = fake({
      prepare: () => prepared as never,
      sendEmail: async (p) => {
        emailed.push(p);
        return { ok: true };
      },
      markSent: async (_id, _orgId, _req, p) => {
        marked.push(p);
        return true;
      },
    });
    await runSendPipeline(sendable, 7, "org1", baseReq);
    expect(emailed[0]).toBe(prepared);
    expect(marked[0]).toBe(prepared);
  });

  it("throws NotFoundError when markSent misses", async () => {
    const { sendable } = fake({ markSent: async () => false });
    await expect(runSendPipeline(sendable, 7, "org1", baseReq)).rejects.toThrow(
      NotFoundError
    );
  });

  it("reports afterSentOk: true when there is no side effect", async () => {
    const { sendable } = fake();
    await expect(
      runSendPipeline(sendable, 7, "org1", baseReq)
    ).resolves.toEqual({ afterSentOk: true });
  });

  it("reports afterSentOk: true when afterSent runs cleanly", async () => {
    const { sendable } = fake({ afterSent: async () => {} });
    await expect(
      runSendPipeline(sendable, 7, "org1", baseReq)
    ).resolves.toEqual({ afterSentOk: true });
  });

  it("awaits afterSent after markSent and reports its failure instead of swallowing it", async () => {
    const { sendable, calls } = fake({
      afterSent: async () => {
        calls.push("afterSent");
        throw new Error("side effect blew up");
      },
    });
    // The send still succeeds (the email already went out)…
    await expect(
      runSendPipeline(sendable, 7, "org1", baseReq)
    ).resolves.toEqual(
      { afterSentOk: false } // …but the failure is reported, not silent.
    );
    expect(calls.indexOf("afterSent")).toBeGreaterThan(
      calls.indexOf("markSent")
    );
    expect(logError).toHaveBeenCalled();
  });
});
