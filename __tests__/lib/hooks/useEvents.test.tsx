// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDeleteEvent } from "@/lib/hooks/useEvents";

afterEach(() => vi.unstubAllGlobals());

describe("event deletion", () => {
  it.each([
    403, 404, 409, 500,
  ])("surfaces a %i failure and refreshes stale event caches", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "NOT_FOUND",
              message: "This event is no longer available",
            },
          }),
          { status, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    client.setQueryData(["events"], [{ id: 812 }]);
    client.setQueryData(["estimates", "schedulable"], []);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeleteEvent(), { wrapper });
    result.current.mutate(812);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe(
      "This event is no longer available"
    );
    expect(result.current.isSuccess).toBe(false);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["events"] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["estimates", "schedulable"],
    });
    expect(client.getQueryState(["events"])?.isInvalidated).toBe(true);
    client.clear();
  });
});
