import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EstimateListView } from "@/components/estimates/EstimateList";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Estimates — SqFt" };

export default async function EstimatesPage() {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  return (
    <Suspense fallback={null}>
      <EstimateListView />
    </Suspense>
  );
}
