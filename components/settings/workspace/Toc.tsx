"use client";

import { useEffect, useState } from "react";

const ENTRIES = [
  { id: "identity", n: "01", label: "Identity" },
  { id: "brand", n: "02", label: "Brand & Quote Style" },
  { id: "defaults", n: "03", label: "Estimating Defaults" },
];

export function Toc() {
  const [active, setActive] = useState<string>("identity");

  useEffect(() => {
    const sections = ENTRIES.map((e) => document.getElementById(e.id)).filter(
      (el): el is HTMLElement => el !== null
    );
    if (sections.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          )[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-25% 0px -65% 0px", threshold: 0 }
    );
    sections.forEach((s) => {
      obs.observe(s);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <aside
      className="sticky top-20 self-start h-max hidden md:block"
      aria-label="Settings sections"
    >
      <div className="font-mono text-[10px] tracking-[.2em] uppercase text-[var(--muted)] pb-3 mb-3.5 border-b border-[var(--line)]">
        Contents
      </div>
      <ol className="list-none p-0 m-0">
        {ENTRIES.map((e) => {
          const isActive = active === e.id;
          return (
            <li key={e.id}>
              <a
                href={`#${e.id}`}
                className={[
                  "flex items-baseline gap-3 py-[7px] no-underline transition-colors",
                  isActive
                    ? "text-[var(--ink)]"
                    : "text-[var(--muted)] hover:text-[var(--ink-2)]",
                ].join(" ")}
              >
                <span
                  className={[
                    "font-mono text-[10px] w-[22px] tabular-nums transition-colors",
                    isActive ? "text-[var(--accent)]" : "text-[var(--line-2)]",
                  ].join(" ")}
                >
                  {e.n}
                </span>
                <span
                  className={[
                    "text-[13px] tracking-[-.01em]",
                    isActive ? "font-[600]" : "",
                  ].join(" ")}
                >
                  {e.label}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
