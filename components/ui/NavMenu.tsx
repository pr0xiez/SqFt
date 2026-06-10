"use client";

import Link from "next/link";
import { NavIcon } from "@/components/ui/nav-icons";
import { cn } from "@/lib/cn";
import {
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
}: {
  role: string;
  pathname: string;
  onNavigate?: () => void;
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
          "flex items-center gap-3 px-4 py-2.5 rounded-[var(--r)]",
          "text-[13px] transition-colors duration-150",
          active
            ? "text-[var(--accent)] font-[600] bg-[var(--surface-2)]"
            : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
        )}
      >
        <NavIcon icon={item.icon} active={active} size={18} />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-0.5">
      {groups.map((group) => (
        <div key={group.id}>
          <div className="font-[var(--font-mono)] text-[9px] tracking-[var(--ls-cap)] uppercase text-[var(--muted)] px-4 pt-3 pb-1">
            {group.label}
          </div>
          {group.items.map((item) => (
            <Row key={item.href} item={item} />
          ))}
        </div>
      ))}
      {canSeeSettings(role) && (
        <div className="mt-2 pt-2 border-t border-[var(--line)]">
          <Row item={SETTINGS_ITEM} />
        </div>
      )}
    </nav>
  );
}
