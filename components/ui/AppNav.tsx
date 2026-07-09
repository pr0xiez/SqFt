"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { MobileTabBar } from "@/components/ui/MobileTabBar";
import { NavDrawer } from "@/components/ui/NavDrawer";
import { SideNav } from "@/components/ui/SideNav";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/nav/initials";

export function AppNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const role = session?.user?.role ?? "crew";
  const isSuperAdmin = session?.user?.isSuperAdmin ?? false;
  const isCrew = role === "crew";

  return (
    <>
      <SideNav />

      {/* Mobile: crew gets a slim top bar; everyone else gets the bottom bar. */}
      {isCrew ? (
        <header
          className={cn(
            "md:hidden order-1 shrink-0 z-[60]",
            "flex items-center justify-between h-[52px] px-4",
            "bg-[var(--surface)] border-b border-[var(--line)]",
            "transition-[background,border-color] duration-[250ms]"
          )}
        >
          <span className="text-[18px] font-[800] tracking-[-0.025em] leading-none">
            <em className="not-italic text-[var(--accent)]">Sq</em>Ft
          </span>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className={cn(
              "w-[34px] h-[34px] rounded-full",
              "bg-[var(--surface-2)] border border-[var(--line)]",
              "flex items-center justify-center cursor-pointer",
              "font-[var(--font-mono)] text-[11px] font-[600] text-[var(--accent)]",
              "hover:border-[var(--accent)] transition-colors"
            )}
          >
            {getInitials(session?.user?.name, session?.user?.email)}
          </button>
        </header>
      ) : (
        <MobileTabBar pathname={pathname} onMore={() => setDrawerOpen(true)} />
      )}

      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        role={role}
        pathname={pathname}
        isSuperAdmin={isSuperAdmin}
      />
    </>
  );
}
