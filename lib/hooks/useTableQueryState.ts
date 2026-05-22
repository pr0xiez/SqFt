"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Density } from "@/components/ui/DensityToggle";
import type { SortDirection, SortState } from "@/lib/sort";

/**
 * Table-state hook that mirrors page/sort/filter/search to the URL,
 * and persists user preferences (density, perPage) to localStorage.
 *
 * The hook is generic over the sort-key union and the filter object. Filter
 * keys are stringly typed in the URL; consumers convert to their own types.
 *
 * URL precedence: query params override defaults on first paint, then state
 * is fully controlled in-React and pushed back to the URL on change.
 */
type Args<SortKey extends string> = {
  /** Stable identifier used for localStorage keys, e.g. "customers". */
  storageKey: string;
  /** Allowed sort keys (any string outside this list is rejected). */
  validSortKeys: readonly SortKey[];
  /** Default sort applied when the URL has none. */
  defaultSort?: SortState<SortKey> | null;
  defaultPerPage?: number;
  defaultDensity?: Density;
};

const isSortDirection = (v: string | null): v is SortDirection =>
  v === "asc" || v === "desc";

const PER_PAGE_VALUES = [25, 50, 100];

export function useTableQueryState<SortKey extends string>(
  args: Args<SortKey>
) {
  const {
    storageKey,
    validSortKeys,
    defaultSort = null,
    defaultPerPage = 25,
    defaultDensity = "comfortable",
  } = args;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── URL-controlled state ────────────────────────────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: read URL on mount only
  const initialSort = useMemo<SortState<SortKey> | null>(() => {
    const key = searchParams.get("sort");
    const dir = searchParams.get("dir");
    if (key && validSortKeys.includes(key as SortKey) && isSortDirection(dir)) {
      return { key: key as SortKey, direction: dir };
    }
    return defaultSort;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: read URL on mount only
  const initialPage = useMemo(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  }, []);

  const [sort, setSortState] = useState<SortState<SortKey> | null>(initialSort);
  const [page, setPageState] = useState<number>(initialPage);

  // ── localStorage-backed preferences ─────────────────────────────────
  const [perPage, setPerPageState] = useState<number>(() => {
    if (typeof window === "undefined") return defaultPerPage;
    const stored = window.localStorage.getItem(`tbl:${storageKey}:perPage`);
    const n = Number(stored);
    return PER_PAGE_VALUES.includes(n) ? n : defaultPerPage;
  });

  const [density, setDensityState] = useState<Density>(() => {
    if (typeof window === "undefined") return defaultDensity;
    const stored = window.localStorage.getItem(`tbl:${storageKey}:density`);
    return stored === "compact" || stored === "comfortable"
      ? stored
      : defaultDensity;
  });

  useEffect(() => {
    window.localStorage.setItem(`tbl:${storageKey}:perPage`, String(perPage));
  }, [storageKey, perPage]);

  useEffect(() => {
    window.localStorage.setItem(`tbl:${storageKey}:density`, density);
  }, [storageKey, density]);

  // ── URL writer ──────────────────────────────────────────────────────
  // We coalesce writes inside a single render via a ref so that updating
  // multiple pieces of state in one handler only triggers one router.replace.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeUrl = useCallback(
    (next: { sort: SortState<SortKey> | null; page: number }) => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (next.sort) {
          params.set("sort", next.sort.key);
          params.set("dir", next.sort.direction);
        } else {
          params.delete("sort");
          params.delete("dir");
        }
        if (next.page > 1) params.set("page", String(next.page));
        else params.delete("page");
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }, 50);
    },
    [pathname, router, searchParams]
  );

  const setSort = useCallback(
    (next: SortState<SortKey> | null) => {
      setSortState(next);
      setPageState(1);
      writeUrl({ sort: next, page: 1 });
    },
    [writeUrl]
  );

  const setPage = useCallback(
    (next: number) => {
      setPageState(next);
      writeUrl({ sort, page: next });
    },
    [sort, writeUrl]
  );

  const setPerPage = useCallback((next: number) => {
    setPerPageState(next);
    setPageState(1);
  }, []);

  const setDensity = useCallback((next: Density) => {
    setDensityState(next);
  }, []);

  /** Reset page to 1 — call when filter/search changes from outside. */
  const resetPage = useCallback(() => {
    setPageState(1);
    writeUrl({ sort, page: 1 });
  }, [sort, writeUrl]);

  return {
    sort,
    page,
    perPage,
    density,
    setSort,
    setPage,
    setPerPage,
    setDensity,
    resetPage,
  };
}

/**
 * Page a flat array. Returns the slice plus useful indices.
 * Does not mutate the input.
 */
export function paginate<T>(items: T[], page: number, perPage: number) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = (safePage - 1) * perPage;
  const end = start + perPage;
  return {
    slice: items.slice(start, end),
    safePage,
    pageCount,
    total,
  };
}
