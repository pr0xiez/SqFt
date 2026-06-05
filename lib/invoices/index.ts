// Client-safe surface. Snapshot lives in ./snapshot and is server-imported
// directly (it is pure but conceptually a server artifact, mirroring estimateView).
export { computeEstimateBilling, prorateInvoice } from "./compute";
export type {
  EstimateBilling,
  InvoiceLike,
  ProratedBreakdown,
  ProratedLine,
  ProrationSource,
} from "./types";
