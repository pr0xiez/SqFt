"use client";

import { useQueryClient } from "@tanstack/react-query";
import { signOut, useSession } from "next-auth/react";
import { SignOutIcon } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/cn";
import { getInitials } from "@/lib/nav/initials";
import { clearPersistedQueryCache } from "@/lib/queryCache";

export function AccountBlock({
  variant = "inline",
}: {
  variant?: "inline" | "compact";
}) {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const user = session?.user;
  const initials = getInitials(user?.name, user?.email);

  function handleSignOut() {
    // Drop every cached response — in memory AND the persisted copy — before
    // the session ends. Without this the next person to sign in on this
    // machine rehydrates the previous org's data out of localStorage.
    qc.clear();
    clearPersistedQueryCache();
    signOut({ callbackUrl: "/login" });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 size-9 rounded-full",
            "bg-[var(--ink)] text-[var(--bg)]",
            "flex items-center justify-center",
            "text-[12.5px] font-[700] tracking-[0.01em]"
          )}
        >
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-[620] leading-tight truncate">
            {user?.name ?? "Signed in"}
          </div>
          {user?.role && (
            <div className="text-[13px] text-[var(--muted)] mt-0.5 capitalize">
              {user.role}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Sign out"
          title="Sign out"
          className={cn(
            "shrink-0 inline-flex items-center justify-center gap-1.5 h-9 rounded-[var(--r)]",
            "text-[13.5px] font-[560] text-[var(--ink-2)] cursor-pointer",
            "hover:text-[var(--ink)] hover:bg-[var(--hover)] transition-colors",
            variant === "inline" ? "px-3 border border-[var(--line-2)]" : "w-9"
          )}
        >
          <SignOutIcon aria-hidden="true" className="size-[17px]" />
          {variant === "inline" && <span>Sign out</span>}
        </button>
      </div>

      <ThemeToggle className="w-full [&>*]:flex-1" />
    </div>
  );
}
