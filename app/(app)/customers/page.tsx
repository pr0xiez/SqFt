import { Suspense } from "react";
import { CustomerListView } from "@/components/customers/CustomerList";

export const metadata = { title: "Customers — SqFt" };

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomerListView />
    </Suspense>
  );
}
