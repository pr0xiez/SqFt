"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";
import { MobileSessionSheet } from "@/components/ui/MobileSessionSheet";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/cn";

const NAV_TABS = [
  { href: "/", label: "Dashboard", screen: "dashboard" },
  { href: "/customers", label: "Customers", screen: "customers" },
  { href: "/estimates", label: "Estimates", screen: "estimates" },
  { href: "/quotes", label: "Quotes", screen: "quote-list" },
  { href: "/schedule", label: "Schedule", screen: "schedule" },
];

export function AppNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sheetOpen, setSheetOpen] = useState(false);

  const initials = getInitials(session?.user?.name, session?.user?.email);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Desktop Top Nav ── */}
      <nav
        className={cn(
          "hidden md:block order-1 shrink-0",
          "bg-[var(--surface)] border-b border-[var(--line)]",
          "transition-[background,border-color] duration-[250ms]"
        )}
        aria-label="Main navigation"
      >
        <div className="flex items-center h-[60px] px-8 gap-7 max-w-[1200px] mx-auto">
          <span className="text-[18px] font-[800] tracking-[-0.025em] select-none leading-none">
            <em className="not-italic text-[var(--accent)]">Sq</em>Ft
          </span>

          {NAV_TABS.map(({ href, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "font-[var(--font-mono)] text-[11px] tracking-[.02em]",
                  "bg-transparent border-none cursor-pointer",
                  "py-1.5 border-b-2 transition-[color,border-color] duration-150",
                  active
                    ? "text-[var(--ink)] border-b-[var(--accent)]"
                    : "text-[var(--muted)] border-b-transparent hover:text-[var(--ink)]"
                )}
              >
                {label}
              </Link>
            );
          })}

          <div className="ml-auto flex items-center gap-2.5">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sign out"
              aria-label="Sign out"
              className={cn(
                "w-[30px] h-[30px] rounded-full",
                "bg-[var(--surface-2)] border border-[var(--line)]",
                "flex items-center justify-center cursor-pointer",
                "font-[var(--font-mono)] text-[11px] font-[600] text-[var(--ink)]",
                "hover:border-[var(--accent)] hover:text-[var(--accent)]",
                "transition-colors"
              )}
            >
              {initials}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className={cn(
          "md:hidden order-3 shrink-0 relative z-[60]",
          "bg-[var(--surface)] border-t border-[var(--line)]",
          "transition-[background,border-color] duration-[250ms]",
          "py-1.5 px-1 pb-[calc(6px+env(safe-area-inset-bottom,0px))]"
        )}
        aria-label="Main navigation"
      >
        {/* ── Session seal — floats above the nav like a stamped mark ── */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="Open session menu"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          className={cn(
            "absolute bottom-full right-3 mb-2",
            "w-[34px] h-[34px] rounded-full",
            "bg-[var(--surface)] border border-[var(--line)]",
            "shadow-[var(--shadow)]",
            "flex items-center justify-center cursor-pointer",
            "font-[var(--font-mono)] text-[10.5px] font-[600]",
            "text-[var(--accent)] tracking-[.02em]",
            "transition-[transform,border-color,box-shadow] duration-150",
            "active:scale-95 hover:border-[var(--accent)]"
          )}
        >
          {initials}
        </button>

        <div className="grid grid-cols-5 gap-0.5 max-w-[520px] mx-auto">
          {NAV_TABS.map(({ href, label }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-[3px]",
                  "py-[7px] px-1 min-h-[50px] rounded-lg",
                  "font-[var(--font-mono)] text-[9.5px] tracking-[.04em]",
                  "transition-colors duration-150 relative",
                  active ? "text-[var(--accent)]" : "text-[var(--muted)]"
                )}
              >
                {active && (
                  <span className="absolute top-[-7px] left-1/2 -translate-x-1/2 w-6 h-0.5 bg-[var(--accent)] rounded-b-sm" />
                )}
                <NavIcon label={label} active={active} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <MobileSessionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
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

function NavIcon({ label, active }: { label: string; active: boolean }) {
  const sw = active ? "2" : "1.7";
  const props = {
    viewBox: "0 0 24 24",
    width: 22,
    height: 22,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  const icons: Record<string, React.ReactNode> = {
    Dashboard: (
      <svg {...props}>
        <title>{label}</title>
        <path d="M3 12L12 4l9 8" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
      </svg>
    ),
    Customers: (
      <svg {...props}>
        <title>{label}</title>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      </svg>
    ),
    Estimates: (
      <svg {...props}>
        <title>{label}</title>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </svg>
    ),
    Quotes: (
      <svg {...props}>
        <title>{label}</title>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M12 7v10" />
        <path d="M14.5 9.5c-.7-.7-1.7-.9-2.5-.5-1 .5-1.2 1.7-.4 2.3.7.5 1.7.5 2.4 1 .8.6.6 1.8-.4 2.3-.8.4-1.8.2-2.5-.5" />
      </svg>
    ),
    Schedule: (
      <svg {...props}>
        <title>{label}</title>
        <rect x="4" y="5" width="16" height="15" rx="1.5" />
        <path d="M4 9h16M9 3v4M15 3v4" />
      </svg>
    ),
  };
  return <>{icons[label] ?? null}</>;
}
