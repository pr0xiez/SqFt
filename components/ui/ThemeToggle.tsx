"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const initial = saved === "dark" ? "dark" : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial === "dark" ? "dark" : "";
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next === "dark" ? "dark" : "";
    localStorage.setItem("theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        "font-[var(--font-mono)] text-[11px] tracking-[.02em]",
        "border border-[var(--line)] bg-transparent cursor-pointer",
        "px-[10px] py-[6px] rounded-[6px] text-[var(--muted)]",
        "transition-[border-color,color] duration-[150ms]",
        "hover:border-[var(--ink-2)] hover:text-[var(--ink)]",
        "flex items-center gap-1.5"
      )}
      title="Toggle theme"
    >
      <span>{theme === "dark" ? "☀" : "☾"}</span>
      <span>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}
