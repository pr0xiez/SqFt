import { redirect } from "next/navigation";
import { CustomerDetailView } from "@/components/customers/CustomerDetail";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { parseRouteId } from "@/lib/routeParams";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Customer — SqFt" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  const { id } = await params;
  return <CustomerDetailView customerId={parseRouteId(id)} />;
}
