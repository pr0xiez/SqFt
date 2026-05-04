"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/cn";

const NAV_TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/customers", label: "Customers" },
  { href: "/estimates", label: "Estimates" },
  { href: "/schedule", label: "Schedule" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <>
      {/* ── Desktop / Tablet Top Nav ── */}
      <nav
        className={cn(
          "hidden md:flex items-center h-[60px] px-7 sticky top-0 z-[200]",
          "bg-[var(--surface)] border-b border-[var(--line)]",
          "transition-[background,border-color] duration-[250ms]"
        )}
        aria-label="Main navigation"
      >
        {/* Brand */}
        <span className="font-[var(--font-display)] text-[18px] font-[800] text-[var(--ink)] mr-9 select-none leading-none tracking-tight">
          <em className="not-italic text-[var(--accent)]">Sq</em>Ft
          <span
            className={cn(
              "ml-2 font-[var(--font-mono)] font-normal text-[10px]",
              "text-[var(--muted)] border border-[var(--line)] px-[10px] py-[3px]",
              "rounded-[4px] uppercase tracking-[.06em] align-middle"
            )}
          >
            v0.9
          </span>
        </span>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 h-full">
          {NAV_TABS.map(({ href, label }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative h-full flex items-center px-4",
                  "font-[var(--font-mono)] text-[11px] font-[500] tracking-[.02em]",
                  "transition-colors duration-[150ms]",
                  active
                    ? "text-[var(--ink)] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[var(--accent)] after:rounded-t-[1px]"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {/* Right: theme toggle + avatar */}
        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle />
          <div
            className={cn(
              "w-[30px] h-[30px] rounded-full",
              "bg-[var(--surface-2)] border border-[var(--line)]",
              "flex items-center justify-center",
              "font-[var(--font-mono)] text-[11px] font-[600] text-[var(--ink-2)] tracking-[.04em]",
              "select-none"
            )}
          >
            MJ
          </div>
        </div>
      </nav>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 z-[200]",
          "bg-[var(--surface)] border-t border-[var(--line)]",
          "transition-[background,border-color] duration-[250ms]",
          "pb-[env(safe-area-inset-bottom,0px)]"
        )}
        aria-label="Main navigation"
      >
        <div className="grid grid-cols-4 gap-0.5 max-w-[520px] mx-auto px-1 py-1.5">
          {NAV_TABS.map(({ href, label }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-[3px]",
                  "py-[7px] px-1 min-h-[50px]",
                  "font-[var(--font-mono)] text-[9.5px] font-[500] tracking-[.04em]",
                  "rounded-lg transition-colors duration-[150ms]",
                  "relative",
                  active
                    ? "text-[var(--accent)] before:absolute before:top-[-6px] before:left-1/2 before:-translate-x-1/2 before:w-6 before:h-[2px] before:bg-[var(--accent)] before:rounded-b-[2px]"
                    : "text-[var(--muted)]"
                )}
              >
                <NavIcon label={label} active={active} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function NavIcon({ label, active }: { label: string; active: boolean }) {
  const sw = active ? "2" : "1.7";
  const icons: Record<string, React.ReactNode> = {
    Dashboard: (
      <svg
        viewBox="0 0 24 24"
        width={22}
        height={22}
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 12L12 4l9 8" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
      </svg>
    ),
    Customers: (
      <svg
        viewBox="0 0 24 24"
        width={22}
        height={22}
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      </svg>
    ),
    Estimates: (
      <svg
        viewBox="0 0 24 24"
        width={22}
        height={22}
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </svg>
    ),
    Schedule: (
      <svg
        viewBox="0 0 24 24"
        width={22}
        height={22}
        fill="none"
        stroke="currentColor"
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="4" y="5" width="16" height="15" rx="1.5" />
        <path d="M4 9h16M9 3v4M15 3v4" />
      </svg>
    ),
  };
  return <>{icons[label] ?? null}</>;
}
