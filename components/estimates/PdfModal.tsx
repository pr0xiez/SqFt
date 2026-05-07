"use client";

import { PDFDownloadLink, PDFViewer } from "@react-pdf/renderer";
import { useEffect } from "react";
import {
  EstimatePdfDoc,
  type PdfMode,
} from "@/components/estimates/EstimatePdf";
import { Button } from "@/components/ui/Button";
import type { Estimate } from "@/lib/hooks/useEstimates";
import type { Org } from "@/lib/hooks/useOrg";

interface Props {
  open: boolean;
  onClose: () => void;
  estimate: Estimate;
  org: Org;
  mode?: PdfMode;
}

export default function PdfModal({
  open,
  onClose,
  estimate,
  org,
  mode = "quote",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const isInvoice = mode === "invoice";
  const docType = isInvoice ? "Invoice" : "Quote";
  const invoicePrefix = org.invoicePrefix?.trim() || "INV";
  const docNumber = isInvoice
    ? estimate.invoiceNumber
      ? `${invoicePrefix}-${estimate.invoiceNumber}`
      : `#${estimate.id}`
    : estimate.quoteNumber
      ? `Q-${estimate.quoteNumber}`
      : `#${estimate.id}`;
  const customerSlug = (estimate.customer?.name ?? "customer")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "");
  const filename = `${docType}-${docNumber}-${customerSlug}.pdf`;
  const doc = <EstimatePdfDoc estimate={estimate} org={org} mode={mode} />;

  return (
    <>
      <div
        className="fixed inset-0 z-[500] bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${docType} PDF`}
        className="fixed inset-4 z-[501] bg-[var(--surface)] rounded-xl flex flex-col overflow-hidden md:inset-8 lg:inset-12"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--line)] bg-[var(--surface-2)] shrink-0">
          <div>
            <div className="text-[18px] font-[700] tracking-[-0.025em]">
              {docType} PDF
            </div>
            <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] mt-0.5">
              {docNumber} · {estimate.title || `Estimate #${estimate.id}`} ·{" "}
              {estimate.customer?.name}
            </div>
          </div>
          <div className="flex gap-2">
            <PDFDownloadLink document={doc} fileName={filename}>
              {({ loading }) => (
                <Button variant="primary" size="sm" disabled={loading}>
                  {loading ? "Generating…" : "Download PDF"}
                </Button>
              )}
            </PDFDownloadLink>
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        {/* PDF preview */}
        <div className="flex-1" style={{ minHeight: 0 }}>
          <PDFViewer width="100%" height="100%" style={{ border: "none" }}>
            {doc}
          </PDFViewer>
        </div>
      </div>
    </>
  );
}
