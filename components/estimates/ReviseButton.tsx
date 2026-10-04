"use client";

import { useRouter } from "next/navigation";
import { Button, type ButtonVariant } from "@/components/ui/Button";
import { ArrowCounterClockwiseIcon } from "@/components/ui/icons";
import { useReviseEstimate } from "@/lib/hooks/useEstimates";

export function ReviseButton({
  estimateId,
  variant = "ink",
}: {
  estimateId: number;
  /** "primary" when revising is the page's next step (a declined estimate). */
  variant?: ButtonVariant;
}) {
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
    <Button
      type="button"
      variant={variant}
      onClick={onClick}
      disabled={revise.isPending || revise.isSuccess}
    >
      <ArrowCounterClockwiseIcon aria-hidden="true" />
      {revise.isPending ? "Revising…" : "Revise"}
    </Button>
  );
}
