// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTableQueryState } from "@/lib/hooks/useTableQueryState";

// ── next/navigation mock ─────────────────────────────────────────────────
//
// useTableQueryState reads its initial state from useSearchParams and
// writes back via router.replace. We expose a `setSearchParams` helper so
// each test can seed the URL it wants the hook to observe on mount.

const routerReplace = vi.fn();
let currentSearch = "";

const setSearchParams = (qs: string) => {
  currentSearch = qs;
};

vi.mock("next/navigation", () => ({
  usePathname: () => "/customers",
  useRouter: () => ({ replace: routerReplace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

type Key = "name" | "date" | "total";
const ARGS = {
  storageKey: "test-table",
  validSortKeys: ["name", "date", "total"] as readonly Key[],
  defaultSort: { key: "date" as Key, direction: "desc" as const },
};

beforeEach(() => {
  routerReplace.mockReset();
  currentSearch = "";
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTableQueryState — initial state", () => {
  it("uses defaults when the URL has no params and localStorage is empty", () => {
    const { result } = renderHook(() => useTableQueryState(ARGS));
    expect(result.current.sort).toEqual({ key: "date", direction: "desc" });
    expect(result.current.page).toBe(1);
    expect(result.current.perPage).toBe(25);
    expect(result.current.density).toBe("comfortable");
  });

  it("parses sort + page from the URL on mount", () => {
    setSearchParams("sort=name&dir=asc&page=3");
    const { result } = renderHook(() => useTableQueryState(ARGS));
    expect(result.current.sort).toEqual({ key: "name", direction: "asc" });
    expect(result.current.page).toBe(3);
  });

  it("rejects an unknown sort key and falls back to default", () => {
    setSearchParams("sort=ssn&dir=asc");
    const { result } = renderHook(() => useTableQueryState(ARGS));
    expect(result.current.sort).toEqual({ key: "date", direction: "desc" });
  });

  it("rejects an invalid sort direction and falls back to default", () => {
    setSearchParams("sort=name&dir=upside-down");
    const { result } = renderHook(() => useTableQueryState(ARGS));
    expect(result.current.sort).toEqual({ key: "date", direction: "desc" });
  });

  it("rejects non-positive page numbers", () => {
    setSearchParams("page=-5");
    const { result } = renderHook(() => useTableQueryState(ARGS));
    expect(result.current.page).toBe(1);
  });

  it("restores perPage from localStorage when it matches a valid option", () => {
    window.localStorage.setItem("tbl:test-table:perPage", "100");
    const { result } = renderHook(() => useTableQueryState(ARGS));
    expect(result.current.perPage).toBe(100);
  });

  it("ignores garbage perPage in localStorage", () => {
    window.localStorage.setItem("tbl:test-table:perPage", "37");
    const { result } = renderHook(() => useTableQueryState(ARGS));
    expect(result.current.perPage).toBe(25);
  });

  it("restores density from localStorage", () => {
    window.localStorage.setItem("tbl:test-table:density", "compact");
    const { result } = renderHook(() => useTableQueryState(ARGS));
    expect(result.current.density).toBe("compact");
  });
});

describe("useTableQueryState — URL writes", () => {
  it("writes ?sort and ?dir after a debounce when setSort is called", () => {
    const { result } = renderHook(() => useTableQueryState(ARGS));
    act(() => {
      result.current.setSort({ key: "name", direction: "asc" });
    });

    // Nothing fired yet.
    expect(routerReplace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(60);
    });

    expect(routerReplace).toHaveBeenCalledWith("/customers?sort=name&dir=asc", {
      scroll: false,
    });
  });

  it("includes ?page=N when page > 1, and omits it on page 1", () => {
    const { result } = renderHook(() => useTableQueryState(ARGS));
    act(() => {
      result.current.setPage(4);
      vi.advanceTimersByTime(60);
    });
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/customers?sort=date&dir=desc&page=4",
      { scroll: false }
    );

    act(() => {
      result.current.setPage(1);
      vi.advanceTimersByTime(60);
    });
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/customers?sort=date&dir=desc",
      { scroll: false }
    );
  });

  it("resets page to 1 when sort changes", () => {
    const { result } = renderHook(() => useTableQueryState(ARGS));
    act(() => {
      result.current.setPage(5);
      vi.advanceTimersByTime(60);
    });
    expect(result.current.page).toBe(5);

    act(() => {
      result.current.setSort({ key: "name", direction: "asc" });
      vi.advanceTimersByTime(60);
    });
    expect(result.current.page).toBe(1);
  });

  it("coalesces paired updates inside a single tick into one router.replace", () => {
    // Two synchronous setters inside the same act() should debounce
    // into one URL write — what's in that single write is implementation
    // detail (last-call wins, capturing closure-time sort), so we only
    // assert the coalescing count here.
    const { result } = renderHook(() => useTableQueryState(ARGS));
    act(() => {
      result.current.setSort({ key: "total", direction: "desc" });
      result.current.setPage(2);
      vi.advanceTimersByTime(60);
    });
    expect(routerReplace).toHaveBeenCalledTimes(1);
  });

  it("writes pathname with no query when sort is cleared and page is 1", () => {
    const { result } = renderHook(() => useTableQueryState(ARGS));
    act(() => {
      result.current.setSort(null);
      vi.advanceTimersByTime(60);
    });
    expect(routerReplace).toHaveBeenCalledWith("/customers", { scroll: false });
  });
});

describe("useTableQueryState — preference persistence", () => {
  it("persists perPage to localStorage and resets page to 1", () => {
    const { result } = renderHook(() => useTableQueryState(ARGS));
    act(() => {
      result.current.setPage(3);
      vi.advanceTimersByTime(60);
    });

    act(() => {
      result.current.setPerPage(50);
      vi.advanceTimersByTime(60);
    });

    expect(window.localStorage.getItem("tbl:test-table:perPage")).toBe("50");
    expect(result.current.perPage).toBe(50);
    expect(result.current.page).toBe(1);
  });

  it("persists density to localStorage without touching the URL", () => {
    const { result } = renderHook(() => useTableQueryState(ARGS));
    act(() => {
      result.current.setDensity("compact");
      vi.advanceTimersByTime(60);
    });
    expect(window.localStorage.getItem("tbl:test-table:density")).toBe(
      "compact"
    );
    // Density flips don't touch the URL.
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
