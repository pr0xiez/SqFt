import { Suspense } from "react";
import { QuoteListView } from "@/components/quotes/QuoteList";

export const metadata = { title: "Quotes — SqFt" };

export default function QuotesPage() {
  return (
    <Suspense fallback={null}>
      <QuoteListView />
    </Suspense>
  );
}
