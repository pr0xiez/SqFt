import { redirect } from "next/navigation";
import { Suspense } from "react";
import { InvoiceListView } from "@/components/invoices/InvoiceList";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  return (
    <Suspense fallback={null}>
      <InvoiceListView />
    </Suspense>
  );
}
