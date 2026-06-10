"use client";

import { signOut, useSession } from "next-auth/react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/nav/initials";

export function AccountBlock({
  variant = "inline",
}: {
  variant?: "inline" | "compact";
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const initials = getInitials(user?.name, user?.email);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 w-9 h-9 rounded-full",
            "bg-[var(--surface-2)] border border-[var(--line)]",
            "flex items-center justify-center",
            "font-[var(--font-mono)] text-[12px] font-[600] text-[var(--accent)]"
          )}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-[600] tracking-[var(--ls-snug)] leading-tight truncate">
            {user?.name ?? "Signed in"}
          </div>
          {user?.role && (
            <div className="font-[var(--font-mono)] text-[10px] uppercase tracking-[var(--ls-cap)] text-[var(--muted)] mt-0.5">
              {user.role}
            </div>
          )}
        </div>
        {variant === "inline" && <ThemeToggle />}
      </div>

      {variant === "compact" && (
        <div className="flex items-center justify-between gap-2">
          <ThemeToggle />
        </div>
      )}

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className={cn(
          "w-full flex items-center justify-center gap-2",
          "px-3 py-2.5 rounded-[var(--r)]",
          "bg-[var(--accent)] hover:bg-[var(--accent-d)]",
          "text-white font-[var(--font-mono)] text-[11px] tracking-[var(--ls-cap)] uppercase",
          "transition-colors duration-150 active:translate-y-[1px]"
        )}
      >
        <span>Sign out</span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
