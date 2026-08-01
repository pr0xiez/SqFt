"use client";

import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { SessionProvider } from "next-auth/react";
import { type ReactNode, useState } from "react";
import { QuickCreateProvider } from "@/components/quick-create/QuickCreateProvider";
import { ToastProvider } from "@/components/ui/Toast";
import {
  isPersistableQueryKey,
  QUERY_CACHE_BUSTER,
  QUERY_CACHE_KEY,
} from "@/lib/queryCache";

const CACHE_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours

export function Providers({ children }: { children: ReactNode }) {
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
      key: QUERY_CACHE_KEY,
    });

    return { queryClient: qc, persister: p };
  });

  return (
    <SessionProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: CACHE_MAX_AGE,
          buster: QUERY_CACHE_BUSTER,
          dehydrateOptions: {
            // Default policy (successful queries only) minus anything the
            // cache policy says must not touch localStorage.
            shouldDehydrateQuery: (query) =>
              defaultShouldDehydrateQuery(query) &&
              isPersistableQueryKey(query.queryKey),
          },
        }}
      >
        <ToastProvider>
          <QuickCreateProvider>{children}</QuickCreateProvider>
        </ToastProvider>
        {process.env.NODE_ENV === "development" && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </PersistQueryClientProvider>
    </SessionProvider>
  );
}
