"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReviseButton({ quoteId }: { quoteId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function onClick() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/revise`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      const body = (await res.json()) as { id: number };
      router.push(`/quotes/${body.id}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revise");
      setPending(false);
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="py-2.5 px-4 bg-[var(--accent)] text-white border-0 rounded-md text-[13px] font-[600] inline-flex items-center gap-1.5 disabled:opacity-60"
    >
      {pending ? "Revising…" : "Revise"}
    </button>
  );
}
