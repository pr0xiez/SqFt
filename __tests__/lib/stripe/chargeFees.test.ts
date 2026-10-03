import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

import { logError } from "@/lib/logger";
import {
  BALANCE_TX_RETRY_DELAYS_MS,
  type ChargeFees,
  chargeFees,
  retrieveChargeFees,
  retryForBalance,
} from "@/lib/stripe/chargeFees";

const NO_BT: ChargeFees = { id: "ch_1", balanceFee: null, balanceNet: null };
const WITH_BT: ChargeFees = { id: "ch_1", balanceFee: 2.06, balanceNet: 58.69 };
const NO_CHARGE: ChargeFees = { id: null, balanceFee: null, balanceNet: null };
const ZERO_DELAYS = BALANCE_TX_RETRY_DELAYS_MS.map(() => 0);

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("chargeFees", () => {
  it("converts the expanded balance transaction's cents to dollars", () => {
    expect(
      chargeFees({ id: "ch_1", balance_transaction: { fee: 206, net: 5869 } })
    ).toEqual(WITH_BT);
  });

  it("keeps the charge id with null fee/net while the balance transaction is missing", () => {
    expect(chargeFees({ id: "ch_1", balance_transaction: null })).toEqual(
      NO_BT
    );
    expect(chargeFees({ id: "ch_1" })).toEqual(NO_BT);
    // Unexpanded id: fee/net unknown.
    expect(chargeFees({ id: "ch_1", balance_transaction: "txn_1" })).toEqual(
      NO_BT
    );
    expect(chargeFees("ch_1")).toEqual(NO_BT);
  });

  it("has no id when no charge is attached", () => {
    expect(chargeFees(null)).toEqual(NO_CHARGE);
    expect(chargeFees(undefined)).toEqual(NO_CHARGE);
  });
});

describe("retrieveChargeFees", () => {
  it("reads the PaymentIntent's charge + balance transaction on the connected account", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      latest_charge: {
        id: "ch_1",
        balance_transaction: { fee: 206, net: 5869 },
      },
    });
    const stripe = { paymentIntents: { retrieve } } as never;

    await expect(retrieveChargeFees(stripe, "acct_1", "pi_1")).resolves.toEqual(
      WITH_BT
    );
    expect(retrieve).toHaveBeenCalledWith(
      "pi_1",
      { expand: ["latest_charge.balance_transaction"] },
      { stripeAccount: "acct_1" }
    );
  });
});

describe("retryForBalance", () => {
  it("does not re-read when the balance transaction is already readable", async () => {
    const reread = vi.fn();
    await expect(retryForBalance(WITH_BT, reread)).resolves.toBe(WITH_BT);
    expect(reread).not.toHaveBeenCalled();
  });

  it("does not re-read when no charge is attached (callers defer that case)", async () => {
    const reread = vi.fn();
    await expect(retryForBalance(NO_CHARGE, reread)).resolves.toBe(NO_CHARGE);
    expect(reread).not.toHaveBeenCalled();
  });

  it("re-reads until the lagging balance transaction appears", async () => {
    const reread = vi
      .fn()
      .mockResolvedValueOnce(NO_BT)
      .mockResolvedValueOnce(WITH_BT);
    await expect(retryForBalance(NO_BT, reread, ZERO_DELAYS)).resolves.toEqual(
      WITH_BT
    );
    expect(reread).toHaveBeenCalledTimes(2);
  });

  it("gives up within the latency budget and returns the charge with null fee/net", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const reread = vi.fn().mockResolvedValue(NO_BT);
    let settled: ChargeFees | undefined;
    void retryForBalance(NO_BT, reread).then((fees) => {
      settled = fees;
    });

    const budgetMs = BALANCE_TX_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
    // A webhook delivery and a waiting customer are on the other end: the
    // total back-off stays ~2s (plus the re-reads' own round trips).
    expect(budgetMs).toBeLessThanOrEqual(2000);
    await vi.advanceTimersByTimeAsync(budgetMs - 1);
    expect(settled).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toEqual(NO_BT);
    expect(reread).toHaveBeenCalledTimes(BALANCE_TX_RETRY_DELAYS_MS.length);
  });

  it("treats a failing re-read as best-effort: stops, logs, keeps the last read", async () => {
    const reread = vi.fn().mockRejectedValue(new Error("stripe down"));
    await expect(retryForBalance(NO_BT, reread, ZERO_DELAYS)).resolves.toEqual(
      NO_BT
    );
    expect(reread).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: expect.stringContaining("ch_1") })
    );
  });

  it("ignores a re-read naming a different charge, so fee/net always match the recorded charge", async () => {
    const reread = vi
      .fn()
      .mockResolvedValue({ id: "ch_other", balanceFee: 9, balanceNet: 91 });
    await expect(retryForBalance(NO_BT, reread, ZERO_DELAYS)).resolves.toEqual(
      NO_BT
    );
  });
});
