"use client";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { SessionProvider, useSession } from "next-auth/react";
import { type ReactNode, useState } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { PersisterContext } from "@/components/ui/useLogout";

const CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <QueryProviders>{children}</QueryProviders>
    </SessionProvider>
  );
}

function QueryProviders({ children }: { children: ReactNode }) {
  // Keyed to the signed-in identity so a user change on a shared device
  // invalidates (busts) the previous user's persisted, org-scoped cache
  // instead of rehydrating it (#202).
  const { data: session } = useSession();
  const buster = session?.user?.id ?? "anon";

  const [{ queryClient, persister }] = useState(() => {
    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60 * 1000,
          gcTime: Infinity,
          retry: 1,
        },
      },
    });

    const p = createSyncStoragePersister({
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    });

    return { queryClient: qc, persister: p };
  });

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: CACHE_MAX_AGE, buster }}
    >
      <PersisterContext.Provider value={persister}>
        <ToastProvider>{children}</ToastProvider>
      </PersisterContext.Provider>
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </PersistQueryClientProvider>
  );
}
