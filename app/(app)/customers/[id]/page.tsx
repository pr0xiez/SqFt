import { CustomerDetailView } from "@/components/customers/CustomerDetail";

export const metadata = { title: "Customer — SqFt" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: Props) {
  const { id } = await params;
  return <CustomerDetailView customerId={parseInt(id, 10)} />;
}
