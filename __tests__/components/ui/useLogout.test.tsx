// @vitest-environment jsdom

import type { Persister } from "@tanstack/query-persist-client-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersisterContext, useLogout } from "@/components/ui/useLogout";

const signOut = vi.fn((_opts?: unknown) => Promise.resolve());
vi.mock("next-auth/react", () => ({
  signOut: (opts?: unknown) => signOut(opts),
}));

beforeEach(() => {
  signOut.mockClear();
});

function makePersister(calls: string[]): Persister {
  return {
    persistClient: vi.fn(),
    restoreClient: vi.fn(),
    removeClient: vi.fn(() => {
      calls.push("removeClient");
    }),
  };
}

function wrapper(persister: Persister | null, queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <PersisterContext.Provider value={persister}>
          {children}
        </PersisterContext.Provider>
      </QueryClientProvider>
    );
  };
}

describe("useLogout", () => {
  it("clears the cache and removes the persisted client before signing out", async () => {
    const calls: string[] = [];
    const persister = makePersister(calls);
    const queryClient = new QueryClient();
    const clearSpy = vi.spyOn(queryClient, "clear").mockImplementation(() => {
      calls.push("clear");
    });
    signOut.mockImplementation((_opts?: unknown) => {
      calls.push("signOut");
      return Promise.resolve();
    });

    const { result } = renderHook(() => useLogout(), {
      wrapper: wrapper(persister, queryClient),
    });

    await result.current({ callbackUrl: "/login" });

    expect(clearSpy).toHaveBeenCalledOnce();
    expect(persister.removeClient).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
    // clear + removeClient must both run before navigating away.
    expect(calls).toEqual(["clear", "removeClient", "signOut"]);
  });

  it("still signs out when no persister is provided", async () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useLogout(), {
      wrapper: wrapper(null, queryClient),
    });

    await result.current();

    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
