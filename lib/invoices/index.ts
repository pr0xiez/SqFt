// Client-safe surface. Snapshot lives in ./snapshot and is server-imported
// directly (it is pure but conceptually a server artifact, mirroring estimateView).
export {
  computeEstimateBilling,
  isOverbill,
  OVERBILL_EPSILON,
  prorateInvoice,
} from "./compute";
export type {
  DeriveInvoiceAmountArgs,
  InvoiceFormMode,
} from "./createInvoiceForm";
export { deriveInvoiceAmount, invoiceLeaves } from "./createInvoiceForm";
export type {
  EstimateBilling,
  InvoiceLike,
  ProratedBreakdown,
  ProratedLine,
  ProrationSource,
} from "./types";
