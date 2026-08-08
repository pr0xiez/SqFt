"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { QuickBooksCard } from "@/components/settings/QuickBooksCard";
import { SyncHealthPanel } from "@/components/settings/SyncHealthPanel";
import { useToast } from "@/components/ui/Toast";
import { useQboStatus } from "@/lib/hooks/useQbo";

export function IntegrationsView() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { data, isLoading } = useQboStatus();

  // Returning from the OAuth flow: refresh status and confirm the result.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("qbo");
    if (!outcome) return;
    qc.invalidateQueries({ queryKey: ["qbo-status"] });
    showToast(
      outcome === "connected"
        ? "QuickBooks connected"
        : params.get("reason") === "realm_in_use"
          ? "That QuickBooks company is already connected to another SqFt organization"
          : "QuickBooks connection failed — try again"
    );
    window.history.replaceState(null, "", window.location.pathname);
  }, [qc, showToast]);

  return (
    <div className="max-w-[760px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-1">
        Integrations
      </h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        Keep your books in sync without double entry.
      </p>

      {isLoading || !data ? (
        <p className="text-[13px] text-[var(--muted)]">Loading…</p>
      ) : !data.configured ? (
        <p className="text-[13px] text-[var(--muted)]">
          No integrations are available on this deployment.
        </p>
      ) : (
        <>
          <QuickBooksCard status={data} />
          <SyncHealthPanel status={data} />
        </>
      )}
    </div>
  );
}
