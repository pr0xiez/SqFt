"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { NewMenu } from "@/components/quick-create/NewMenu";
import { AccountBlock } from "@/components/ui/AccountBlock";
import { BrandMark } from "@/components/ui/BrandMark";
import { SidebarSimpleIcon } from "@/components/ui/icons";
import { NavMenu } from "@/components/ui/NavMenu";
import { NavIcon } from "@/components/ui/nav-icons";
import { hasMinRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/cn";
import { useSidebarCollapsed } from "@/lib/hooks/useSidebarCollapsed";
import {
  ADMIN_ITEM,
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
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const canQuickCreate = hasMinRole(role, "lead");

  return (
    <aside
      className={cn(
        "hidden md:flex order-1 shrink-0 flex-col h-full",
        "bg-[var(--bg)] border-r border-[var(--line)]",
        "transition-[width] duration-300 ease-[var(--ease)]",
        collapsed ? "w-[64px]" : "w-[236px]"
      )}
    >
      <div
        className={cn(
          "flex items-center h-16 shrink-0",
          collapsed ? "justify-center px-2" : "justify-between pl-5 pr-3"
        )}
      >
        {!collapsed && (
          <Link
            href="/"
            aria-label="SqFt home"
            className="no-underline rounded-[var(--r-in)]"
          >
            <BrandMark />
          </Link>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="size-8 rounded-[var(--r)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--hover)] transition-colors cursor-pointer"
        >
          <SidebarSimpleIcon aria-hidden="true" className="size-[18px]" />
        </button>
      </div>

      {canQuickCreate && (
        <div
          className={cn(
            "shrink-0",
            collapsed ? "flex justify-center pb-2" : "px-3 pb-3"
          )}
        >
          <NewMenu collapsed={collapsed} />
        </div>
      )}

      <div
        className={cn("flex-1 overflow-y-auto", collapsed ? "px-2" : "px-3")}
      >
        {collapsed ? (
          <IconRail
            role={role}
            pathname={pathname}
            isSuperAdmin={isSuperAdmin}
          />
        ) : (
          <NavMenu
            role={role}
            pathname={pathname}
            isSuperAdmin={isSuperAdmin}
          />
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

function IconRail({
  role,
  pathname,
  isSuperAdmin,
}: {
  role: string;
  pathname: string;
  isSuperAdmin: boolean;
}) {
  const items = navGroupsFor(role).flatMap((g) => g.items);
  if (canSeeSettings(role)) items.push(SETTINGS_ITEM);
  if (isSuperAdmin) items.push(ADMIN_ITEM);
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
              "size-10 rounded-[var(--r)] flex items-center justify-center transition-colors",
              active
                ? "text-[var(--accent)] bg-[var(--surface)] shadow-[inset_0_0_0_1px_var(--line)]"
                : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--hover)]"
            )}
          >
            <NavIcon icon={item.icon} active={active} size={20} />
          </Link>
        );
      })}
    </nav>
  );
}
