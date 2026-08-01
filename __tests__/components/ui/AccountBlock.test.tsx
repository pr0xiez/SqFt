// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "Alex Lead", role: "lead" } } }),
  signOut: (...args: unknown[]) => signOut(...args),
}));

import { AccountBlock } from "@/components/ui/AccountBlock";
import { QUERY_CACHE_KEY } from "@/lib/queryCache";

describe("AccountBlock", () => {
  it("drops cached responses — in memory and in localStorage — before signing out", () => {
    // Neither used to happen. The persisted cache (24h maxAge, gcTime Infinity)
    // outlived the session, so on a shared machine the next person to sign in
    // rehydrated the previous org's data straight out of localStorage.
    const qc = new QueryClient();
    qc.setQueryData(["stripe-connect"], { connected: true });
    window.localStorage.setItem(QUERY_CACHE_KEY, "{}");

    render(
      <QueryClientProvider client={qc}>
        <AccountBlock />
      </QueryClientProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));

    expect(qc.getQueryData(["stripe-connect"])).toBeUndefined();
    expect(window.localStorage.getItem(QUERY_CACHE_KEY)).toBeNull();
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
