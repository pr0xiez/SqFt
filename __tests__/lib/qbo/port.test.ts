import { afterEach, describe, expect, it, vi } from "vitest";
import { makeQboPort } from "@/lib/qbo/port";

afterEach(() => vi.unstubAllGlobals());
describe("QBO payment balance reads", () => {
  const context = async () => ({
    accessToken: "test",
    realmId: "test",
    apiBaseUrl: "https://qbo.example",
  });
  it("reads the actual open balance rather than the original invoice total", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          Invoice: { Id: "7", SyncToken: "0", TotalAmt: 450, Balance: 20 },
        })
      )
    );
    expect(await makeQboPort(context).readInvoiceBalance("7")).toBe(20);
  });
  it("refuses to create a payment when the balance is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ Invoice: { Id: "7", TotalAmt: 450 } })
        )
    );
    await expect(makeQboPort(context).readInvoiceBalance("7")).rejects.toThrow(
      "balance is unavailable"
    );
  });
});
