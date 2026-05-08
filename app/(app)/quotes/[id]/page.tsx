import { QuoteBuilderView } from "@/components/quotes/QuoteBuilder";

export const metadata = { title: "Quote Builder — SqFt" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function QuoteBuilderPage({ params }: Props) {
  const { id } = await params;
  return <QuoteBuilderView quoteId={parseInt(id, 10)} />;
}
