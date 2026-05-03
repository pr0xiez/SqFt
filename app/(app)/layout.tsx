import type { ReactNode } from "react";
import { AppNav } from "@/components/ui/AppNav";
import { Providers } from "@/components/ui/Providers";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <AppNav />
      <main className="max-w-[1200px] mx-auto px-4 md:px-8 py-8 md:pt-8 pt-4 pb-24 md:pb-8">
        {children}
      </main>
    </Providers>
  );
}
