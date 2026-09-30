"use client";

import { useRouter } from "next/navigation";
import { useReviseEstimate } from "@/lib/hooks/useEstimates";

export function ReviseButton({ estimateId }: { estimateId: number }) {
  const router = useRouter();
  const revise = useReviseEstimate();

  async function onClick() {
    if (revise.isPending || revise.isSuccess) return;
    try {
      const { id } = await revise.mutateAsync(estimateId);
      router.push(`/estimates/${id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revise");
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={revise.isPending || revise.isSuccess}
      className="py-2.5 px-4 bg-[var(--accent)] text-white border-0 rounded-md text-[13px] font-[600] inline-flex items-center gap-1.5 disabled:opacity-60"
    >
      {revise.isPending ? "Revising…" : "Revise"}
    </button>
  );
}
