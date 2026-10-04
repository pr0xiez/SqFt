"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const ENTRIES = [
  { id: "identity", label: "Identity" },
  { id: "brand", label: "Brand & estimate style" },
  { id: "defaults", label: "Estimating defaults" },
];

export function Toc() {
  const [active, setActive] = useState<string>("identity");

  useEffect(() => {
    const sections = ENTRIES.map((e) => document.getElementById(e.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (sections.length === 0) return;

    // Track each section's last-known intersection state across callbacks.
    // The IO callback only delivers entries that CHANGED — we need the
    // full picture to pick the topmost intersecting section in DOM order.
    const intersecting = new Set<string>();

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            intersecting.add(entry.target.id);
          } else {
            intersecting.delete(entry.target.id);
          }
        }
        // Pick the first ENTRIES entry whose id is currently intersecting.
        // ENTRIES is in DOM order, so this is the topmost on screen.
        const topmost = ENTRIES.find((e) => intersecting.has(e.id));
        if (topmost) setActive(topmost.id);
      },
      // A section is "intersecting" when any part of it sits below the
      // sticky nav (80px) and above the bottom 40% of the viewport.
      // Wide enough that consecutive sections overlap, so DOM order wins.
      { rootMargin: "-80px 0px -40% 0px", threshold: 0 }
    );
    sections.forEach((s) => {
      obs.observe(s);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <aside
      className="sticky top-8 self-start h-max hidden md:block"
      aria-label="Settings sections"
    >
      <div className="type-label pb-2.5 mb-2 border-b border-[var(--line)]">
        Contents
      </div>
      <ol className="list-none p-0 m-0">
        {ENTRIES.map((e) => {
          const isActive = active === e.id;
          return (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex items-center min-h-9 pl-3 -ml-px border-l-2 text-[14px] no-underline transition-colors",
                  isActive
                    ? "border-[var(--accent)] text-[var(--ink)] font-[600]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                {e.label}
              </a>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
