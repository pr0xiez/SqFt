import { redirect } from "next/navigation";
import { EstimateBuilderView } from "@/components/estimates/EstimateBuilder";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Estimate Builder — SqFt" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EstimateBuilderPage({ params }: Props) {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  const { id } = await params;
  return <EstimateBuilderView estimateId={parseInt(id, 10)} />;
}
