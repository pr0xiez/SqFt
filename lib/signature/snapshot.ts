import { createHash } from "node:crypto";
import {
  getEffectiveQty,
  type LineItemCalc,
  liSubtotal,
  type RoomItem,
} from "@/lib/utils";

export interface QuoteSnapshotInput {
  quoteNumber: number;
  date: Date | string;
  convenienceFeeRate: number;
  markupPct: number;
  depositPct: number;
  estimate: {
    customer: {
      name: string | null;
      address: string | null;
      email: string | null;
      phone: string | null;
    } | null;
    items: RoomItem[];
  };
  lineItems: LineItemCalc[];
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

export function snapshotQuote(input: QuoteSnapshotInput): QuoteSnapshot {
  const rooms = input.estimate.items.filter(
    (i): i is RoomItem => i.type === "room"
  );
  const subtotal = input.lineItems.reduce(
    (sum, li) => sum + (liSubtotal(li, rooms) ?? 0),
    0
  );
  const markup = subtotal * (input.markupPct / 100);
  const beforeFee = subtotal + markup;
  const convenienceFee = beforeFee * input.convenienceFeeRate;
  const total = beforeFee + convenienceFee;
  const deposit = total * input.depositPct;

  return {
    quoteNumber: input.quoteNumber,
    date:
      typeof input.date === "string" ? input.date : input.date.toISOString(),
    convenienceFeeRate: input.convenienceFeeRate,
    markupPct: input.markupPct,
    depositPct: input.depositPct,
    customer: input.estimate.customer,
    org: input.org,
    items: input.estimate.items.map((i) => ({
      id: i.id,
      type: i.type,
      name: i.name ?? null,
      shape: i.shape ?? null,
      w: i.w ?? null,
      l: i.l ?? null,
      note: i.note ?? null,
      text: i.text ?? null,
    })),
    lineItems: input.lineItems.map((li) => ({
      id: li.id,
      sortOrder: li.sortOrder ?? 0,
      name: li.name,
      rate: li.rate,
      qtyMode: li.qtyMode,
      qty: li.qty ?? null,
      wastePct: li.wastePct,
      unitLabel: li.unitLabel,
      linkedRoomIds: li.linkedRoomIds,
      effectiveQty: getEffectiveQty(li, rooms),
      subtotal: liSubtotal(li, rooms),
    })),
    totals: { subtotal, markup, convenienceFee, total, deposit },
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
