import type Stripe from "stripe";
import { logError } from "@/lib/logger";

/**
 * A Stripe payment's charge plus the processing fee / contractor net from its
 * balance transaction (dollars), read on the connected account (direct charge)
 * by both payment recorders: the webhook's `retrieveCharge` dep
 * (`app/api/webhooks/stripe/route.ts`) and the confirm route.
 */
export interface ChargeFees {
  /** The real charge id (`ch_…`); null while no charge is attached yet. */
  id: string | null;
  /** Null while the charge's balance transaction isn't readable. */
  balanceFee: number | null;
  balanceNet: number | null;
}

/**
 * Back-off between re-reads of a charge whose balance transaction isn't
 * readable yet. Stripe can expose a fresh charge a few seconds before its
 * balance transaction (read-after-write lag), but a webhook delivery or a
 * customer waiting on the confirm call is on the other end, so the budget
 * stays under ~2s of waiting. Later than that, the payment is recorded with
 * null fee/net and backfilled by a later delivery (`recordStripePayment`).
 */
export const BALANCE_TX_RETRY_DELAYS_MS: readonly number[] = [250, 500, 1000];

/** An expanded `latest_charge`: a `Stripe.Charge`, or a route's narrower cast. */
interface ExpandedCharge {
  id: string;
  balance_transaction?: string | { fee: number; net: number } | null;
}

/** Project an expanded `latest_charge` onto ChargeFees (cents → dollars). */
export function chargeFees(
  charge: ExpandedCharge | string | null | undefined
): ChargeFees {
  if (!charge) return { id: null, balanceFee: null, balanceNet: null };
  if (typeof charge === "string") {
    return { id: charge, balanceFee: null, balanceNet: null };
  }
  const bt = charge.balance_transaction;
  return bt && typeof bt === "object"
    ? { id: charge.id, balanceFee: bt.fee / 100, balanceNet: bt.net / 100 }
    : { id: charge.id, balanceFee: null, balanceNet: null };
}

/** One read of a payment intent's charge + balance transaction. */
export async function retrieveChargeFees(
  stripe: Stripe,
  accountId: string,
  paymentIntentId: string
): Promise<ChargeFees> {
  const pi = await stripe.paymentIntents.retrieve(
    paymentIntentId,
    { expand: ["latest_charge.balance_transaction"] },
    { stripeAccount: accountId }
  );
  return chargeFees(pi.latest_charge);
}

/** The charge exists but its balance transaction isn't readable yet. */
function awaitingBalance(fees: ChargeFees): boolean {
  return (
    fees.id !== null && (fees.balanceFee === null || fees.balanceNet === null)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Starting from `first`, re-read with back-off while the charge exists but its
 * balance transaction isn't readable yet; returns the last read. No charge at
 * all is not retried here (the callers defer that case). Re-reads are
 * best-effort: one that fails ends the retry instead of failing the caller,
 * whose payment is recordable either way. A re-read naming a different charge
 * is ignored, so fee/net always belong to the charge being recorded.
 */
export async function retryForBalance(
  first: ChargeFees,
  reread: () => Promise<ChargeFees>,
  delaysMs: readonly number[] = BALANCE_TX_RETRY_DELAYS_MS
): Promise<ChargeFees> {
  let fees = first;
  for (const ms of delaysMs) {
    if (!awaitingBalance(fees)) break;
    await sleep(ms);
    try {
      const next = await reread();
      if (next.id === fees.id) fees = next;
    } catch (err) {
      logError({
        path: "lib/stripe/chargeFees#retryForBalance",
        errorMessage: `Re-reading Stripe charge ${fees.id} for its balance transaction failed`,
        err,
      });
      break;
    }
  }
  return fees;
}
