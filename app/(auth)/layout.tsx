import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-7 py-5">
        <span className="font-[var(--font-display)] text-[18px] font-[800] text-[var(--ink)] select-none leading-none tracking-tight">
          <em className="not-italic text-[var(--accent)]">Sq</em>Ft
        </span>
        <ThemeToggle />
      </header>
      <main className="flex-1 flex items-center justify-center p-6 pb-20">
        {children}
      </main>
      <footer className="text-center py-4 font-[var(--font-mono)] text-[10px] text-[var(--muted)]">
        © 2026 SqFt
      </footer>
    </div>
  );
}
