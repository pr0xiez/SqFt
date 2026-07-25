"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { readApiError } from "@/lib/api/errors";

export interface QboStatus {
  configured: boolean;
  connection: {
    status: string;
    companyName: string | null;
    realmId: string;
    connectedAt: string;
    lastSyncedAt: string | null;
  } | null;
  health: {
    pending: number;
    failed: number;
    done: number;
    pausedAuth: number;
    recentErrors: Array<{
      id: number;
      kind: string;
      entityId: number;
      lastError: string | null;
      updatedAt: string;
    }>;
  } | null;
}

async function jsonOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const { message } = await readApiError(res, fallback);
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export function useQboStatus() {
  return useQuery({
    queryKey: ["qbo-status"],
    queryFn: async () =>
      jsonOrThrow<QboStatus>(
        await fetch("/api/qbo/status"),
        "Failed to load QuickBooks status"
      ),
  });
}

/** Starts the OAuth flow: fetches the authorize URL and navigates to it. */
export function useQboConnect() {
  return useMutation({
    mutationFn: async (): Promise<{ url: string }> =>
      jsonOrThrow<{ url: string }>(
        await fetch("/api/qbo/connect", { method: "POST" }),
        "Failed to start the QuickBooks connection"
      ),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

export function useQboDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ ok: boolean }> =>
      jsonOrThrow<{ ok: boolean }>(
        await fetch("/api/qbo/disconnect", { method: "POST" }),
        "Failed to disconnect QuickBooks"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["qbo-status"] });
    },
  });
}

/** Manual "Sync now" / retry for one invoice. */
export function useQboSyncNow(invoiceId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ ok: boolean }> =>
      jsonOrThrow<{ ok: boolean }>(
        await fetch(`/api/invoices/${invoiceId}/qbo-sync`, {
          method: "POST",
        }),
        "Failed to queue the QuickBooks sync"
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices", invoiceId] });
      qc.invalidateQueries({ queryKey: ["qbo-status"] });
    },
  });
}
