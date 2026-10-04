"use client";

import Link from "next/link";
import { NavIcon } from "@/components/ui/nav-icons";
import { cn } from "@/lib/cn";
import {
  ADMIN_ITEM,
  canSeeSettings,
  isItemActive,
  type NavItem,
  navGroupsFor,
  SETTINGS_ITEM,
} from "@/lib/nav/items";

export function NavMenu({
  role,
  pathname,
  onNavigate,
  isSuperAdmin = false,
}: {
  role: string;
  pathname: string;
  onNavigate?: () => void;
  isSuperAdmin?: boolean;
}) {
  const groups = navGroupsFor(role);

  function Row({ item }: { item: NavItem }) {
    const active = isItemActive(item.href, pathname);
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-3 h-10 md:h-9 px-2.5 rounded-[var(--r)] no-underline",
          "text-[14.5px] md:text-[14px] transition-[background-color,color,box-shadow] duration-150",
          active
            ? "bg-[var(--surface)] text-[var(--ink)] font-[620] shadow-[inset_0_0_0_1px_var(--line)]"
            : "text-[var(--ink-2)] font-[500] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
        )}
      >
        <span
          className={cn(
            "flex",
            active
              ? "text-[var(--accent)]"
              : "text-[var(--muted)] group-hover:text-[var(--ink-2)]"
          )}
        >
          <NavIcon icon={item.icon} active={active} size={19} />
        </span>
        <span className="truncate">{item.label}</span>
      </Link>
    );
  }

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-0.5">
      {groups.map((group, i) => (
        <div key={group.id} className="flex flex-col gap-0.5">
          {/* The first group (Overview) reads fine without a heading. */}
          {i > 0 && (
            <div className="px-2.5 pt-4 pb-1 text-[12.5px] font-[560] text-[var(--muted)]">
              {group.label}
            </div>
          )}
          {group.items.map((item) => (
            <Row key={item.href} item={item} />
          ))}
        </div>
      ))}
      {(canSeeSettings(role) || isSuperAdmin) && (
        <div className="mt-3 pt-3 border-t border-[var(--line)] flex flex-col gap-0.5">
          {canSeeSettings(role) && <Row item={SETTINGS_ITEM} />}
          {isSuperAdmin && <Row item={ADMIN_ITEM} />}
        </div>
      )}
    </nav>
  );
}
