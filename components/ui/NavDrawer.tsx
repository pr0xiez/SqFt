"use client";

import { useEffect } from "react";
import { AccountBlock } from "@/components/ui/AccountBlock";
import { NavMenu } from "@/components/ui/NavMenu";
import { cn } from "@/lib/cn";

export function NavDrawer({
  open,
  onClose,
  role,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  role: string;
  pathname: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div
        data-testid="nav-drawer-scrim"
        onClick={onClose}
        aria-hidden="true"
        className={cn(
          "md:hidden fixed inset-0 z-[400] bg-black/40 backdrop-blur-[2px]",
          "transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          "md:hidden fixed top-0 bottom-0 left-0 z-[401] w-[80%] max-w-[320px]",
          "bg-[var(--surface)] border-r border-[var(--line)] shadow-[var(--shadow-md)]",
          "flex flex-col transition-transform duration-[220ms] ease-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center h-[56px] px-5 shrink-0 border-b border-[var(--line)]">
          <span className="text-[18px] font-[800] tracking-[-0.025em] select-none leading-none">
            <em className="not-italic text-[var(--accent)]">Sq</em>Ft
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <NavMenu role={role} pathname={pathname} onNavigate={onClose} />
        </div>
        <div
          className="shrink-0 p-4 border-t border-[var(--line)]"
          style={{
            paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          }}
        >
          <AccountBlock variant="inline" />
        </div>
      </div>
    </>
  );
}
