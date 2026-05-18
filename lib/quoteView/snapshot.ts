import { createHash } from "node:crypto";
import { computeQuoteView } from "./compute";
import type { LineItemCalc, QuoteInput, RoomItem } from "./types";

/** Side-channel metadata attached to a snapshot but not part of the math.
 *  These fields are copied into the canonicalized snapshot verbatim and
 *  contribute to the hash, so renaming or restructuring them is a breaking
 *  change for already-signed quotes. */
export interface QuoteSnapshotMeta {
  quoteNumber: number;
  date: Date | string;
  customer: {
    name: string | null;
    address: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  org: {
    name: string;
    address: string | null;
    phone: string | null;
    licenseNumber: string | null;
    logo: string | null;
  };
}

export interface QuoteSnapshot {
  quoteNumber: number;
  date: string;
  convenienceFeeRate: number;
  markupPct: number;
  depositPct: number;
  customer: QuoteSnapshotMeta["customer"];
  org: QuoteSnapshotMeta["org"];
  items: Array<Record<string, unknown>>;
  lineItems: Array<Record<string, unknown>>;
  totals: {
    subtotal: number;
    markup: number;
    convenienceFee: number;
    total: number;
    deposit: number;
  };
}

/** Build a serializable, hashable snapshot of a quote — the customer-signed
 *  artifact. Computes the view internally so totals can never diverge from
 *  what the editor or public page showed. */
export function snapshotQuote(
  input: QuoteInput,
  meta: QuoteSnapshotMeta
): QuoteSnapshot {
  const view = computeQuoteView(input);

  return {
    quoteNumber: meta.quoteNumber,
    date: typeof meta.date === "string" ? meta.date : meta.date.toISOString(),
    convenienceFeeRate: input.convenienceFeeRate,
    markupPct: input.markupPct,
    depositPct: input.depositPct,
    customer: meta.customer,
    org: meta.org,
    items: input.items.map((i: RoomItem) => ({
      id: i.id,
      type: i.type,
      name: i.name ?? null,
      shape: i.shape ?? null,
      w: i.w ?? null,
      l: i.l ?? null,
      note: i.note ?? null,
      text: i.text ?? null,
    })),
    lineItems: input.lineItems.map((li: LineItemCalc, idx: number) => ({
      id: li.id,
      sortOrder: li.sortOrder ?? 0,
      name: li.name,
      description: li.description ?? null,
      rate: li.rate,
      qtyMode: li.qtyMode,
      qty: li.qty ?? null,
      wastePct: li.wastePct,
      unitLabel: li.unitLabel,
      linkedRoomIds: li.linkedRoomIds,
      effectiveQty: view.lines[idx]?.effectiveQty ?? null,
      subtotal: view.lines[idx]?.subtotal ?? null,
    })),
    totals: {
      subtotal: view.subtotal,
      markup: view.markup,
      convenienceFee: view.convenienceFee,
      total: view.total,
      deposit: view.deposit,
    },
  };
}

export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
