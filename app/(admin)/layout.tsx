import type { ReactNode } from "react";
import { AppNav } from "@/components/ui/AppNav";
import { Providers } from "@/components/ui/Providers";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Admin · SqFt" };

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireSession();
  const allowed = isSuperAdmin(session.user.email);

  return (
    <Providers>
      <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden">
        <AppNav />
        <main className="order-2 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="max-w-[1200px] mx-auto px-[14px] md:px-8 py-8 pt-4 md:pt-8">
            {allowed ? children : <ForbiddenPanel />}
          </div>
        </main>
      </div>
    </Providers>
  );
}

function ForbiddenPanel() {
  return (
    <div className="max-w-[520px] mx-auto mt-16 border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-6 text-center">
      <div className="text-[10px] font-[var(--font-mono)] tracking-[.08em] uppercase text-[var(--muted)] mb-2">
        403 · Forbidden
      </div>
      <h1 className="text-[20px] font-[700] tracking-[-0.02em] mb-1">
        Super-admin only
      </h1>
      <p className="text-[13px] text-[var(--muted)]">
        This page is reserved for SqFt operators. If you believe you should have
        access, your email needs to be added to{" "}
        <code className="font-[var(--font-mono)]">SUPER_ADMIN_EMAILS</code>.
      </p>
    </div>
  );
}
