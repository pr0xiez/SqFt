import { EstimateBuilderView } from "@/components/estimates/EstimateBuilder";

export const metadata = { title: "Estimate Builder — SqFt" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EstimateBuilderPage({ params }: Props) {
  const { id } = await params;
  return <EstimateBuilderView estimateId={parseInt(id, 10)} />;
}
