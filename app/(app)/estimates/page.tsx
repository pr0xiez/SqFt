import { Suspense } from "react";
import { EstimateListView } from "@/components/estimates/EstimateList";

export const metadata = { title: "Estimates — SqFt" };

export default function EstimatesPage() {
  return (
    <Suspense fallback={null}>
      <EstimateListView />
    </Suspense>
  );
}
