import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";

/** Wraps the public invoice-review pages with a toast context so client
 *  components (e.g. PayInvoiceButton) can surface errors without a full
 *  app-shell provider tree. */
export default function InvoiceReviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <ToastProvider>{children}</ToastProvider>;
}
