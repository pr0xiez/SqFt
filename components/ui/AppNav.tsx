"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { cn } from "@/lib/cn";

const NAV_TABS = [
  { href: "/", label: "Dashboard", screen: "dashboard" },
  { href: "/customers", label: "Customers", screen: "customers" },
  { href: "/estimates", label: "Estimates", screen: "estimates" },
  { href: "/schedule", label: "Schedule", screen: "schedule" },
];

export function AppNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <>
      {/* ── Desktop Top Nav ── */}
      <nav
        className={cn(
          "hidden md:flex items-center h-[60px] px-7 gap-7 sticky top-0 z-50",
          "bg-[var(--surface)] border-b border-[var(--line)]",
          "transition-[background,border-color] duration-[250ms]"
        )}
        aria-label="Main navigation"
      >
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
          <div
            className={cn(
              "w-[30px] h-[30px] rounded-full",
              "bg-[var(--surface-2)] border border-[var(--line)]",
              "flex items-center justify-center",
              "font-[var(--font-mono)] text-[11px] font-[600] text-[var(--ink)]"
            )}
          >
            MJ
          </div>
        </div>
      </nav>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 z-[60]",
          "bg-[var(--surface)] border-t border-[var(--line)]",
          "transition-[background,border-color] duration-[250ms]",
          "py-1.5 px-1 pb-[calc(6px+env(safe-area-inset-bottom,0px))]"
        )}
        aria-label="Main navigation"
      >
        <div className="grid grid-cols-4 gap-0.5 max-w-[520px] mx-auto">
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
    </>
  );
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
        <path d="M3 12L12 4l9 8" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
      </svg>
    ),
    Customers: (
      <svg {...props}>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      </svg>
    ),
    Estimates: (
      <svg {...props}>
        <rect x="5" y="3" width="14" height="18" rx="1.5" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </svg>
    ),
    Schedule: (
      <svg {...props}>
        <rect x="4" y="5" width="16" height="15" rx="1.5" />
        <path d="M4 9h16M9 3v4M15 3v4" />
      </svg>
    ),
  };
  return <>{icons[label] ?? null}</>;
}
