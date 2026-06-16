"use client";

import type { Persister } from "@tanstack/query-persist-client-core";
import { useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { createContext, useCallback, useContext } from "react";

/**
 * Provides the persister backing the persisted React Query cache so logout
 * flows can wipe it. Without this, the previous user's org-scoped data sits
 * in localStorage and rehydrates for the next user on a shared device (#202).
 */
export const PersisterContext = createContext<Persister | null>(null);

/**
 * Returns a logout handler that clears the in-memory query cache AND the
 * persisted client before signing out, so no org-scoped data survives a
 * user change on a shared device.
 */
export function useLogout() {
  const queryClient = useQueryClient();
  const persister = useContext(PersisterContext);

  return useCallback(
    async (options?: { callbackUrl?: string }) => {
      queryClient.clear();
      // removeClient may be async; remove the persisted snapshot before the
      // page navigates away on sign-out.
      await persister?.removeClient();
      await signOut({ callbackUrl: options?.callbackUrl ?? "/login" });
    },
    [queryClient, persister]
  );
}
