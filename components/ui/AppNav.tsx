"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
          "hidden md:flex items-center h-[54px] px-8 sticky top-0 z-[200]",
          "bg-oak border-t-4 border-vermil shadow-[0_2px_16px_rgba(61,50,40,.4)]"
        )}
        aria-label="Main navigation"
      >
        {/* Brand */}
        <span
          className={cn(
            "font-[var(--font-display)] text-[21px] font-black italic text-linen",
            "mr-10 select-none leading-none tracking-tight"
          )}
        >
          Sq<em className="not-italic text-vermil-l">Ft</em>
          <span
            className={cn(
              "ml-2 font-[var(--font-mono)] font-normal text-[10px] not-italic",
              "text-driftwood border border-oak-l px-[10px] py-[3px] uppercase tracking-wide",
              "align-middle"
            )}
          >
            v0.9
          </span>
        </span>

        {/* Tabs */}
        <div className="flex items-center gap-1 h-full">
          {NAV_TABS.map(({ href, label }) => {
            const active =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative h-full flex items-center px-4",
                  "font-[var(--font-mono)] text-xs tracking-widest uppercase",
                  "text-sand hover:text-linen transition-colors",
                  "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[3px]",
                  "after:bg-vermil-l after:scale-x-0 after:transition-transform after:duration-200",
                  active && "text-linen after:scale-x-100"
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 z-[200] h-14",
          "bg-oak border-t-2 border-vermil",
          "flex items-center justify-around",
          "safe-area-inset-bottom"
        )}
        aria-label="Main navigation"
      >
        {NAV_TABS.map(({ href, label }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center h-full gap-0.5",
                "font-[var(--font-mono)] text-[9px] uppercase tracking-wide",
                "min-h-[44px]",
                active ? "text-linen" : "text-sand"
              )}
            >
              <NavIcon label={label} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function NavIcon({ label }: { label: string }) {
  // Simple text icons — replace with SVG icons later
  const icons: Record<string, string> = {
    Dashboard: "⊞",
    Customers: "◎",
    Estimates: "▤",
    Schedule: "▦",
  };
  return (
    <span className="text-base leading-none" aria-hidden="true">
      {icons[label] ?? "•"}
    </span>
  );
}
