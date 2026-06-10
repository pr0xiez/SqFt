export type InvoiceStatusFilter = "all" | "open" | "draft" | "paid" | "void";

/** "Open" = sent to the customer but not yet fully paid. */
export const OPEN_INVOICE_STATUSES = ["sent", "viewed", "partial"] as const;
