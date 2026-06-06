// Client-safe surface. Server-only snapshot/hash helpers (which import
// `node:crypto`) live at `@/lib/estimateView/snapshot` and must be imported
// from there directly so they don't get pulled into client bundles.
export { computeEstimateView } from "./compute";
export { fromPrismaEstimate } from "./fromPrisma";
export { foldMarkupIntoLines } from "./markup";
export type {
  EstimateInput,
  EstimateView,
  LineItemCalc,
  LineView,
  RoomItem,
} from "./types";
