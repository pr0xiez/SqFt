"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect } from "react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/cn";

interface MobileSessionSheetProps {
  open: boolean;
  onClose: () => void;
}

export function MobileSessionSheet({ open, onClose }: MobileSessionSheetProps) {
  const { data: session } = useSession();
  const user = session?.user;

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
      {/* Backdrop — only ever visible on mobile */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-[400]",
          "bg-black/40 backdrop-blur-[2px]",
          "transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Session"
        className={cn(
          "md:hidden fixed left-0 right-0 bottom-0 z-[401]",
          "bg-[var(--surface)] border-t border-[var(--line)]",
          "rounded-t-[14px] shadow-[var(--shadow-md)]",
          "transition-transform duration-[220ms] ease-out",
          open ? "translate-y-0" : "translate-y-full"
        )}
        style={{
          paddingBottom: "calc(18px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Pull handle */}
        <div className="flex justify-center pt-2.5 pb-1.5">
          <span
            aria-hidden="true"
            className="block w-10 h-1 rounded-full bg-[var(--line-2)]"
          />
        </div>

        {/* Identity row */}
        <div className="px-5 pt-2.5">
          <div className="font-[var(--font-mono)] text-[10px] tracking-[var(--ls-cap)] text-[var(--muted)] uppercase mb-2.5">
            Session
          </div>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "shrink-0 w-11 h-11 rounded-full",
                "bg-[var(--surface-2)] border border-[var(--line)]",
                "flex items-center justify-center",
                "font-[var(--font-mono)] text-[13px] font-[600]",
                "text-[var(--accent)]"
              )}
              aria-hidden="true"
            >
              {getInitials(user?.name, user?.email)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-[600] tracking-[var(--ls-snug)] leading-tight truncate">
                  {user?.name ?? "Signed in"}
                </span>
                {user?.role && (
                  <span
                    className={cn(
                      "font-[var(--font-mono)] text-[9px] tracking-[var(--ls-cap)] uppercase",
                      "px-1.5 py-[2px] rounded-[3px]",
                      "border border-[var(--line)] text-[var(--muted)]",
                      "leading-none"
                    )}
                  >
                    {user.role}
                  </span>
                )}
              </div>
              {user?.email && (
                <div className="font-[var(--font-mono)] text-[11px] text-[var(--muted)] truncate mt-1">
                  {user.email}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mx-5 my-4 border-t border-[var(--line)]" />

        {/* Appearance row */}
        <div className="px-5 flex items-center justify-between gap-3">
          <span className="font-[var(--font-mono)] text-[10px] tracking-[var(--ls-cap)] text-[var(--muted)] uppercase">
            Appearance
          </span>
          <ThemeToggle />
        </div>

        <div className="mx-5 my-4 border-t border-[var(--line)]" />

        {/* Sign out */}
        <div className="px-5 pb-1">
          <button
            type="button"
            onClick={() => {
              onClose();
              signOut({ callbackUrl: "/login" });
            }}
            className={cn(
              "w-full flex items-center justify-between",
              "px-4 py-3.5 rounded-[var(--r)]",
              "bg-[var(--accent)] hover:bg-[var(--accent-d)]",
              "text-white font-[var(--font-mono)] text-[12px] tracking-[var(--ls-cap)] uppercase",
              "transition-colors duration-150",
              "active:translate-y-[1px]"
            )}
          >
            <span>Sign out</span>
            <span aria-hidden="true" className="text-[14px] leading-none">
              →
            </span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className={cn(
              "w-full mt-1.5 py-2.5 rounded-[var(--r)]",
              "font-[var(--font-mono)] text-[11px] tracking-[var(--ls-cap)] uppercase",
              "text-[var(--muted)] hover:text-[var(--ink)]",
              "transition-colors duration-150"
            )}
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

function getInitials(name?: string | null, email?: string | null) {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
    const out = (first + last).toUpperCase();
    if (out) return out;
  }
  if (email?.trim()) {
    return email.trim()[0]?.toUpperCase() ?? "·";
  }
  return "··";
}
