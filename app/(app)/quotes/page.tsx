import { redirect } from "next/navigation";
import { Suspense } from "react";
import { QuoteListView } from "@/components/quotes/QuoteList";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Quotes — SqFt" };

export default async function QuotesPage() {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  return (
    <Suspense fallback={null}>
      <QuoteListView />
    </Suspense>
  );
}
