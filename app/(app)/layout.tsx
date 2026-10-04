import type { ReactNode } from "react";
import { AppNav } from "@/components/ui/AppNav";
import { Providers } from "@/components/ui/Providers";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      {/* `md:flex-row` is load-bearing: AppNav renders the full-height SideNav
          on md+, which must sit beside <main> (a row), not stacked above it. */}
      <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden">
        <AppNav />
        <main className="order-2 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]">
          <div className="max-w-[1280px] mx-auto px-[14px] md:px-10 pt-5 pb-16 md:pt-10">
            {children}
          </div>
        </main>
      </div>
    </Providers>
  );
}
