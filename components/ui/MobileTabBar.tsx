"use client";

import Link from "next/link";
import { PlusIcon } from "@/components/ui/icons";
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

/** The center "New" cell: the quick-create launcher, one tap from any screen. */
function NewCell({ onNew }: { onNew: () => void }) {
  return (
    <button
      type="button"
      onClick={onNew}
      aria-haspopup="dialog"
      className={cn(
        cellBase,
        "bg-transparent border-none cursor-pointer text-[var(--ink)] active:scale-[0.96]"
      )}
    >
      <span className="size-[30px] -my-[3px] rounded-[var(--r)] bg-[var(--accent)] text-[var(--on-accent)] flex items-center justify-center">
        <PlusIcon aria-hidden="true" weight="bold" className="size-[17px]" />
      </span>
      <span>New</span>
    </button>
  );
}

export function MobileTabBar({
  pathname,
  onMore,
  onNew,
}: {
  pathname: string;
  onMore: () => void;
  /** Opens the quick-create sheet; omit to hide the New cell. */
  onNew?: () => void;
}) {
  const moreActive = isMoreActive(pathname);
  const half = Math.ceil(BOTTOM_BAR_SHORTCUTS.length / 2);
  const shortcut = (s: (typeof BOTTOM_BAR_SHORTCUTS)[number]) => {
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
  };
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
      <div
        className={cn(
          "grid gap-0.5 max-w-[680px] mx-auto",
          onNew ? "grid-cols-6" : "grid-cols-5"
        )}
      >
        {BOTTOM_BAR_SHORTCUTS.slice(0, half).map(shortcut)}
        {onNew && <NewCell onNew={onNew} />}
        {BOTTOM_BAR_SHORTCUTS.slice(half).map(shortcut)}
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
