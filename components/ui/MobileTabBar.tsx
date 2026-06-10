"use client";

import Link from "next/link";
import { NavIcon } from "@/components/ui/nav-icons";
import { cn } from "@/lib/cn";
import {
  BOTTOM_BAR_SHORTCUTS,
  isItemActive,
  isMoreActive,
} from "@/lib/nav/items";

const cellBase = cn(
  "flex flex-col items-center justify-center gap-[3px]",
  "py-[7px] px-1 min-h-[50px] rounded-lg",
  "font-[var(--font-mono)] text-[9.5px] tracking-[.04em]",
  "transition-colors duration-150 relative whitespace-nowrap"
);

export function MobileTabBar({
  pathname,
  onMore,
}: {
  pathname: string;
  onMore: () => void;
}) {
  const moreActive = isMoreActive(pathname);
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "md:hidden order-3 shrink-0 relative z-[60]",
        "bg-[var(--surface)] border-t border-[var(--line)]",
        "py-1.5 px-1 pb-[calc(6px+env(safe-area-inset-bottom,0px))]"
      )}
    >
      <div className="grid grid-cols-5 gap-0.5 max-w-[680px] mx-auto">
        {BOTTOM_BAR_SHORTCUTS.map((s) => {
          const active = isItemActive(s.href, pathname);
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                cellBase,
                active ? "text-[var(--accent)]" : "text-[var(--muted)]"
              )}
            >
              {active && (
                <span className="absolute top-[-7px] left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[var(--accent)] rounded-b-sm" />
              )}
              <NavIcon icon={s.icon} active={active} size={22} />
              <span>{s.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onMore}
          aria-current={moreActive ? "page" : undefined}
          aria-haspopup="dialog"
          className={cn(
            cellBase,
            "bg-transparent border-none cursor-pointer",
            moreActive ? "text-[var(--accent)]" : "text-[var(--muted)]"
          )}
        >
          {moreActive && (
            <span className="absolute top-[-7px] left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[var(--accent)] rounded-b-sm" />
          )}
          <NavIcon icon="more" active={moreActive} size={22} />
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
