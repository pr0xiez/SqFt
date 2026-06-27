"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { NewMenu } from "@/components/quick-create/NewMenu";
import { AccountBlock } from "@/components/ui/AccountBlock";
import { NavMenu } from "@/components/ui/NavMenu";
import { NavIcon } from "@/components/ui/nav-icons";
import { hasMinRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/cn";
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed";
import {
  canSeeSettings,
  isItemActive,
  navGroupsFor,
  SETTINGS_ITEM,
} from "@/lib/nav/items";

export function SideNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { collapsed, toggle } = useSidebarCollapsed(session?.user?.id);
  const role = session?.user?.role ?? "crew";
  const canQuickCreate = hasMinRole(role, "lead");

  return (
    <aside
      className={cn(
        "hidden md:flex order-1 shrink-0 flex-col h-full",
        "bg-[var(--surface)] border-r border-[var(--line)]",
        "transition-[width] duration-200",
        collapsed ? "w-[56px]" : "w-[208px]"
      )}
    >
      <div
        className={cn(
          "flex items-center h-[60px] px-4 shrink-0",
          collapsed ? "justify-center" : "justify-between"
        )}
      >
        {!collapsed && (
          <span className="text-[18px] font-[800] tracking-[-0.025em] select-none leading-none">
            <em className="not-italic text-[var(--accent)]">Sq</em>Ft
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors text-[14px] leading-none px-1"
        >
          {collapsed ? "⟩" : "⟨"}
        </button>
      </div>

      {canQuickCreate && (
        <div
          className={cn(
            "shrink-0",
            collapsed ? "flex justify-center pb-1" : "px-3 pb-2"
          )}
        >
          <NewMenu collapsed={collapsed} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2">
        {collapsed ? (
          <IconRail role={role} pathname={pathname} />
        ) : (
          <NavMenu role={role} pathname={pathname} />
        )}
      </div>

      {!collapsed && (
        <div className="shrink-0 p-4 border-t border-[var(--line)]">
          <AccountBlock variant="compact" />
        </div>
      )}
    </aside>
  );
}

function IconRail({ role, pathname }: { role: string; pathname: string }) {
  const items = navGroupsFor(role).flatMap((g) => g.items);
  if (canSeeSettings(role)) items.push(SETTINGS_ITEM);
  return (
    <nav
      aria-label="Main navigation"
      className="flex flex-col items-center gap-1 pt-1"
    >
      {items.map((item) => {
        const active = isItemActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "w-9 h-9 rounded-[var(--r)] flex items-center justify-center transition-colors",
              active
                ? "text-[var(--accent)] bg-[var(--surface-2)]"
                : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
            )}
          >
            <NavIcon icon={item.icon} active={active} size={19} />
          </Link>
        );
      })}
    </nav>
  );
}
