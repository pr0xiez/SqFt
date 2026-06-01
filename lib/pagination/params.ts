import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS } from "@/lib/pagination/constants";
import type { SortDirection, SortState } from "@/lib/sort";

type ParseOpts<K extends string> = {
  validSortKeys: readonly K[];
  defaultSort: SortState<K>;
};

export type PageParams<K extends string> = {
  page: number;
  perPage: number;
  sort: SortState<K>;
  q: string;
};

const isDir = (v: string | null): v is SortDirection =>
  v === "asc" || v === "desc";

export function parsePageParams<K extends string>(
  url: URL,
  opts: ParseOpts<K>
): PageParams<K> {
  const sp = url.searchParams;

  const rawPage = Number(sp.get("page"));
  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const rawPerPage = Number(sp.get("perPage"));
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(rawPerPage)
    ? rawPerPage
    : DEFAULT_PER_PAGE;

  const sortKey = sp.get("sort");
  const dir = sp.get("dir");
  const sort: SortState<K> =
    sortKey && opts.validSortKeys.includes(sortKey as K) && isDir(dir)
      ? { key: sortKey as K, direction: dir }
      : opts.defaultSort;

  const q = (sp.get("q") ?? "").trim();

  return { page, perPage, sort, q };
}
