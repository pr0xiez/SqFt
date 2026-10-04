import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CustomerListView } from "@/components/customers/CustomerList";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  return (
    <Suspense fallback={null}>
      <CustomerListView />
    </Suspense>
  );
}
