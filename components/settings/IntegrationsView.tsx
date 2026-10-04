"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { QuickBooksCard } from "@/components/settings/QuickBooksCard";
import { SyncHealthPanel } from "@/components/settings/SyncHealthPanel";
import { EmptyState, LoadingLine } from "@/components/ui/EmptyState";
import { PlugsIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
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
          : "QuickBooks connection failed. Try again."
    );
    window.history.replaceState(null, "", window.location.pathname);
  }, [qc, showToast]);

  return (
    <div className="max-w-[760px]">
      <PageHeader
        title="Integrations"
        meta="Keep your books in sync without double entry."
      />

      {isLoading || !data ? (
        <div className="card px-5 py-4">
          <LoadingLine />
        </div>
      ) : !data.configured ? (
        <div className="card">
          <EmptyState
            icon={PlugsIcon}
            title="No integrations are available on this deployment."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <QuickBooksCard status={data} />
          <SyncHealthPanel status={data} />
        </div>
      )}
    </div>
  );
}
