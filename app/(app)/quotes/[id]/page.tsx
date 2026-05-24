import { redirect } from "next/navigation";
import { QuoteBuilderView } from "@/components/quotes/QuoteBuilder";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Quote Builder — SqFt" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function QuoteBuilderPage({ params }: Props) {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  const { id } = await params;
  return <QuoteBuilderView quoteId={parseInt(id, 10)} />;
}
