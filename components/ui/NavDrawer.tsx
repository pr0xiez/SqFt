"use client";

import { useEffect } from "react";
import { useQuickCreate } from "@/components/quick-create/QuickCreateProvider";
import { AccountBlock } from "@/components/ui/AccountBlock";
import { BrandMark } from "@/components/ui/BrandMark";
import { buttonClasses } from "@/components/ui/Button";
import { PlusIcon, XIcon } from "@/components/ui/icons";
import { NavMenu } from "@/components/ui/NavMenu";
import { hasMinRole } from "@/lib/auth/permissions";
import { cn } from "@/lib/cn";

export function NavDrawer({
  open,
  onClose,
  role,
  pathname,
  isSuperAdmin,
}: {
  open: boolean;
  onClose: () => void;
  role: string;
  pathname: string;
  isSuperAdmin: boolean;
}) {
  const { open: openQuickCreate } = useQuickCreate();
  const canQuickCreate = hasMinRole(role, "lead");

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
          "md:hidden fixed inset-0 z-[400] bg-[var(--scrim)] backdrop-blur-[3px]",
          "transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        className={cn(
          "md:hidden fixed top-0 bottom-0 left-0 z-[401] w-[84%] max-w-[340px]",
          "bg-[var(--bg)] border-r border-[var(--line)] shadow-[var(--shadow-md)]",
          "flex flex-col transition-transform duration-[380ms] ease-[var(--ease)]",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div
          className="flex items-center justify-between h-16 pl-5 pr-3 shrink-0"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <BrandMark />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="size-10 rounded-[var(--r)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--hover)] cursor-pointer"
          >
            <XIcon aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {canQuickCreate && (
            <div className="pb-3 mb-2 border-b border-[var(--line)]">
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["estimate", "New estimate"],
                    ["invoice", "New invoice"],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      onClose();
                      openQuickCreate(kind);
                    }}
                    className={buttonClasses({
                      variant: kind === "estimate" ? "primary" : "default",
                      size: "md",
                      className: "w-full",
                    })}
                  >
                    <PlusIcon aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <NavMenu
            role={role}
            pathname={pathname}
            onNavigate={onClose}
            isSuperAdmin={isSuperAdmin}
          />
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
