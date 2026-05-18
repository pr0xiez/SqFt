// Client-safe surface. Server-only snapshot/hash helpers (which import
// `node:crypto`) live at `@/lib/quoteView/snapshot` and must be imported
// from there directly so they don't get pulled into client bundles.
export { computeQuoteView } from "./compute";
export { fromPrismaQuote } from "./fromPrisma";
export type {
  LineItemCalc,
  LineView,
  QuoteInput,
  QuoteView,
  RoomItem,
} from "./types";
