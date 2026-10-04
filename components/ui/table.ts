/**
 * Class recipes for the grid-based list tables (estimates, invoices,
 * customers, site measures, members, templates). Lists are CSS grids, not
 * <table>s, so each screen supplies its own `grid-cols-[...]` template and
 * composes these for everything else.
 */

/** The bordered container around a list. */
export const TABLE_SHELL = "card overflow-hidden";

/** Header row: no fill, a hairline under it. Hidden on phones. */
export const TABLE_HEAD = "hidden md:grid border-b border-[var(--line)]";

/** Plain (non-sortable) header cell; matches SortableHeader. */
export const TABLE_HEAD_CELL =
  "px-3.5 py-2.5 text-[13px] font-[500] text-[var(--muted)]";

/** A clickable list row (usually a <button> that routes to the record). */
export const TABLE_ROW =
  "w-full text-left grid items-center border-b border-[var(--line)] last:border-b-0 cursor-pointer transition-colors duration-150 hover:bg-[var(--hover)] focus-visible:outline-offset-[-2px]";

/** Horizontal cell padding; vertical comes from ROW_PADDING (density). */
export const CELL = "px-3.5";

/** The row's main text (customer name, title). */
export const CELL_PRIMARY = "text-[14.5px] font-[600] tracking-[-0.01em]";

/** Secondary line under the primary text (address, contact). */
export const CELL_SUB =
  "text-[13px] text-[var(--muted)] mt-0.5 truncate whitespace-nowrap";

/** Figures: money, record numbers, counts. Right-align numeric columns. */
export const CELL_FIGURE = "type-figure text-[13.5px]";

/** Dates and other quiet metadata. */
export const CELL_META = "text-[13.5px] text-[var(--muted)]";
