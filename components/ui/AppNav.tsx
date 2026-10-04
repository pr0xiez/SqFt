"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { NewSheet } from "@/components/quick-create/NewSheet";
import { BrandMark } from "@/components/ui/BrandMark";
import { MobileTabBar } from "@/components/ui/MobileTabBar";
import { NavDrawer } from "@/components/ui/NavDrawer";
import { SideNav } from "@/components/ui/SideNav";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/nav/initials";

export function AppNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newSheetOpen, setNewSheetOpen] = useState(false);
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
            "flex items-center justify-between h-14 px-4",
            "bg-[color-mix(in_oklab,var(--bg)_92%,transparent)] backdrop-blur-md",
            "border-b border-[var(--line)]"
          )}
        >
          <BrandMark />
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className={cn(
              "size-9 rounded-full",
              "bg-[var(--ink)] text-[var(--bg)]",
              "flex items-center justify-center cursor-pointer",
              "text-[12.5px] font-[700]",
              "transition-transform active:scale-95"
            )}
          >
            {getInitials(session?.user?.name, session?.user?.email)}
          </button>
        </header>
      ) : (
        <>
          <MobileTabBar
            pathname={pathname}
            onMore={() => setDrawerOpen(true)}
            onNew={() => setNewSheetOpen(true)}
          />
          <NewSheet
            open={newSheetOpen}
            onClose={() => setNewSheetOpen(false)}
          />
        </>
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
