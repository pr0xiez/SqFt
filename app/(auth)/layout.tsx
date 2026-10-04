import Image from "next/image";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/ui/BrandMark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
// Same photo as the marketing site's hero (Unsplash, Valentina Giarre; see
// www/images/CREDITS.md). A static import, so it is served from /_next/static
// and never hits the auth proxy for signed-out visitors.
import photo from "./contractor-marking-board.jpg";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex flex-col min-h-[100dvh] px-6 sm:px-10">
        <header className="flex items-center justify-between h-20 shrink-0">
          <BrandMark />
          <ThemeToggle />
        </header>
        <main className="flex-1 flex items-center justify-center py-10">
          {children}
        </main>
        <footer className="py-6 text-[13px] text-[var(--muted)]">
          © 2026 SqFt. Built for flooring contractors.
        </footer>
      </div>

      <div className="hidden lg:block p-4 pl-0">
        <div className="relative h-full min-h-[560px] overflow-hidden rounded-[var(--r)] bg-[var(--surface-2)]">
          <Image
            src={photo}
            alt="A contractor marking a board with a pencil and a tape measure."
            fill
            priority
            sizes="52vw"
            placeholder="blur"
            className="object-cover object-[22%_45%]"
          />
        </div>
      </div>
    </div>
  );
}
