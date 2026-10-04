import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Search + filter chips + trailing controls above a list. On phones the
 * search goes full width and the chips become one horizontal scroller that
 * bleeds to the screen edges (the app shell pads 14px there).
 */
export function ListToolbar({
  search,
  filters,
  trailing,
  className,
}: {
  search?: ReactNode;
  filters?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 mb-4 md:flex-row md:flex-wrap md:items-center md:gap-2",
        className
      )}
    >
      {search}
      {filters ? (
        <div className="-mx-[14px] px-[14px] md:mx-0 md:px-0 flex items-center gap-2 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible">
          {filters}
        </div>
      ) : null}
      {trailing ? (
        <div className="flex items-center justify-end gap-3 md:ml-auto">
          {trailing}
        </div>
      ) : null}
    </div>
  );
}
