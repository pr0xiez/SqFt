// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateMember, useUpdateMember } from "@/lib/hooks/useMembers";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, invalidateSpy, Wrapper };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "u1" }),
    })) as unknown as typeof fetch
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useMembers mutations invalidate the assignable-users picker", () => {
  it("useUpdateMember invalidates the live users picker, never the dead members key", async () => {
    const { invalidateSpy, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateMember(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ id: "u1", archived: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["users"] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["members"] });
  });

  it("useCreateMember invalidates the live users picker, never the dead members key", async () => {
    const { invalidateSpy, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateMember(), {
      wrapper: Wrapper,
    });

    result.current.mutate({
      name: "New Person",
      email: "new@example.com",
      role: "crew",
      password: "hunter2hunter2",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["users"] });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["members"] });
  });

  it("invalidating ['users'] marks the cached ['users','assignable'] picker stale", async () => {
    const { qc, Wrapper } = makeWrapper();
    qc.setQueryData(["users", "assignable"], []);
    expect(qc.getQueryState(["users", "assignable"])?.isInvalidated).toBe(
      false
    );

    const { result } = renderHook(() => useUpdateMember(), {
      wrapper: Wrapper,
    });
    result.current.mutate({ id: "u1", archived: true });

    await waitFor(() =>
      expect(qc.getQueryState(["users", "assignable"])?.isInvalidated).toBe(
        true
      )
    );
  });
});
