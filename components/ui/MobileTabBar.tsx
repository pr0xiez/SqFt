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
  "relative flex flex-col items-center justify-center gap-1",
  "min-h-[52px] px-1 rounded-[var(--r)] no-underline",
  "text-[11.5px] font-[560] whitespace-nowrap",
  "transition-colors duration-150"
);

/** The tape-blade sliver over the active tab. */
function ActiveMark() {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-7 h-[3px] bg-[var(--accent)]"
    />
  );
}

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
        "bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] backdrop-blur-md",
        "border-t border-[var(--line)]",
        "pt-1.5 px-1 pb-[calc(6px+env(safe-area-inset-bottom,0px))]"
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
                active ? "text-[var(--ink)]" : "text-[var(--muted)]"
              )}
            >
              {active && <ActiveMark />}
              <span className={active ? "text-[var(--accent)]" : undefined}>
                <NavIcon icon={s.icon} active={active} size={23} />
              </span>
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
            moreActive ? "text-[var(--ink)]" : "text-[var(--muted)]"
          )}
        >
          {moreActive && <ActiveMark />}
          <span className={moreActive ? "text-[var(--accent)]" : undefined}>
            <NavIcon icon="more" active={moreActive} size={23} />
          </span>
          <span>More</span>
        </button>
      </div>
    </nav>
  );
}
