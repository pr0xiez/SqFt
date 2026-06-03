"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Density } from "@/components/ui/DensityToggle";
import { PER_PAGE_OPTIONS } from "@/components/ui/Pagination";
import type { SortDirection, SortState } from "@/lib/sort";

type Args<SortKey extends string> = {
  storageKey: string;
  validSortKeys: readonly SortKey[];
  defaultSort?: SortState<SortKey> | null;
  defaultPerPage?: number;
  defaultDensity?: Density;
};

const isSortDirection = (v: string | null): v is SortDirection =>
  v === "asc" || v === "desc";

const isDensity = (v: unknown): v is Density =>
  v === "compact" || v === "comfortable";

const storageKeyFor = (storageKey: string, field: string) =>
  `tbl:${storageKey}:${field}`;

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

  // searchParams is captured via ref so the debounced writer always reads
  // the latest URL state at fire time, not the snapshot from when the
  // setSort/setPage call was scheduled.
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const [sort, setSortState] = useState<SortState<SortKey> | null>(() => {
    const key = searchParams.get("sort");
    const dir = searchParams.get("dir");
    if (key && validSortKeys.includes(key as SortKey) && isSortDirection(dir)) {
      return { key: key as SortKey, direction: dir };
    }
    return defaultSort;
  });

  const [page, setPageState] = useState<number>(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  });

  const [perPage, setPerPageState] = useState<number>(defaultPerPage);

  const [density, setDensityState] = useState<Density>(defaultDensity);

  useEffect(() => {
    const stored = window.localStorage.getItem(
      storageKeyFor(storageKey, "perPage")
    );
    const n = Number(stored);
    if ((PER_PAGE_OPTIONS as readonly number[]).includes(n)) setPerPageState(n);
  }, [storageKey]);

  useEffect(() => {
    const stored = window.localStorage.getItem(
      storageKeyFor(storageKey, "density")
    );
    if (isDensity(stored)) setDensityState(stored);
  }, [storageKey]);

  // Debounced URL writer. We coalesce paired setSort+setPage calls inside
  // one handler into a single router.replace.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeUrl = useCallback(
    (next: { sort: SortState<SortKey> | null; page: number }) => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
      writeTimer.current = setTimeout(() => {
        const params = new URLSearchParams(searchParamsRef.current.toString());
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
    [pathname, router]
  );

  useEffect(
    () => () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    },
    []
  );

  // On mount, surface the active sort in the URL when it isn't already there.
  // Without this the initial URL is bare (e.g. /customers) even though a
  // default sort is applied, and the sort only appears once the user changes
  // the page or page size — inconsistent. Keeping the sort always present in
  // the URL also makes the view shareable/bookmarkable from first paint.
  const didSyncSort = useRef(false);
  useEffect(() => {
    if (didSyncSort.current) return;
    didSyncSort.current = true;
    if (sort && searchParamsRef.current.get("sort") === null) {
      writeUrl({ sort, page });
    }
  }, [sort, page, writeUrl]);

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

  const setPerPage = useCallback(
    (next: number) => {
      setPerPageState(next);
      setPageState(1);
      window.localStorage.setItem(
        storageKeyFor(storageKey, "perPage"),
        String(next)
      );
      writeUrl({ sort, page: 1 });
    },
    [sort, storageKey, writeUrl]
  );

  const setDensity = useCallback(
    (next: Density) => {
      setDensityState(next);
      window.localStorage.setItem(storageKeyFor(storageKey, "density"), next);
    },
    [storageKey]
  );

  return {
    sort,
    page,
    perPage,
    density,
    setSort,
    setPage,
    setPerPage,
    setDensity,
  };
}

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
