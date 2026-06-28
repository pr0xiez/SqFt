// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCreateEstimate,
  useDeleteEstimate,
  useSendEstimate,
  useUpdateEstimate,
} from "@/lib/hooks/useEstimates";
import {
  useCreateSiteMeasure,
  useDeleteSiteMeasure,
  useUpdateSiteMeasure,
} from "@/lib/hooks/useSiteMeasures";

// The customer detail page derives its site-measure and estimate lists from the
// nested ["customers", id] query (locations -> siteMeasures -> estimates). Any
// mutation that creates/updates/deletes one of those nested entities must
// invalidate ["customers"] or the customer page shows stale data (e.g. a freshly
// created site measure is missing until the staleTime expires).

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
      status: 200,
      json: async () => ({ id: 1, siteMeasureId: 7 }),
    })) as unknown as typeof fetch
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("site-measure / estimate mutations invalidate the customer page", () => {
  it("useCreateSiteMeasure invalidates ['customers']", async () => {
    const { invalidateSpy, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateSiteMeasure(), {
      wrapper: Wrapper,
    });
    result.current.mutate({ locationId: 3 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["customers"] });
  });

  it("useUpdateSiteMeasure invalidates ['customers']", async () => {
    const { invalidateSpy, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateSiteMeasure(7), {
      wrapper: Wrapper,
    });
    result.current.mutate({ items: [] });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["customers"] });
  });

  it("useDeleteSiteMeasure invalidates ['customers']", async () => {
    const { invalidateSpy, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeleteSiteMeasure(), {
      wrapper: Wrapper,
    });
    result.current.mutate(7);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["customers"] });
  });

  it("useCreateEstimate invalidates ['customers']", async () => {
    const { invalidateSpy, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateEstimate(), {
      wrapper: Wrapper,
    });
    result.current.mutate({ siteMeasureId: 7 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["customers"] });
  });

  it("useUpdateEstimate invalidates ['customers']", async () => {
    const { invalidateSpy, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateEstimate(1), {
      wrapper: Wrapper,
    });
    result.current.mutate({ status: "sent" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["customers"] });
  });

  it("useSendEstimate invalidates ['customers']", async () => {
    const { invalidateSpy, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useSendEstimate(1), {
      wrapper: Wrapper,
    });
    result.current.mutate({ to: "a@b.com", subject: "Your estimate" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["customers"] });
  });

  it("useDeleteEstimate invalidates ['customers']", async () => {
    const { invalidateSpy, Wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeleteEstimate(), {
      wrapper: Wrapper,
    });
    result.current.mutate(1);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["customers"] });
  });
});
