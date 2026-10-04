import type { ReactNode } from "react";
import { AppNav } from "@/components/ui/AppNav";
import { LockSimpleIcon } from "@/components/ui/icons";
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
      {/* `md:flex-row` is load-bearing: AppNav renders the full-height SideNav
          on md+, which must sit beside <main> (a row), not stacked above it. */}
      <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden">
        <AppNav />
        <main className="order-2 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:thin]">
          <div className="max-w-[1280px] mx-auto px-[14px] md:px-10 pt-5 pb-16 md:pt-10">
            {allowed ? children : <ForbiddenPanel />}
          </div>
        </main>
      </div>
    </Providers>
  );
}

function ForbiddenPanel() {
  return (
    <div className="card max-w-[520px] mx-auto mt-16 p-6 md:p-8 text-center">
      <span className="mx-auto mb-4 flex items-center justify-center size-10 rounded-[var(--r)] bg-[var(--accent-wash)] text-[var(--accent-ink)]">
        <LockSimpleIcon aria-hidden="true" className="size-5" />
      </span>
      <div className="type-label mb-1.5">403 · Forbidden</div>
      <h1 className="type-display text-[24px] mb-2">Super-admin only</h1>
      <p className="text-[14px] text-[var(--muted)]">
        This page is reserved for SqFt operators. If you believe you should have
        access, your email needs to be added to{" "}
        <code className="type-figure text-[13px] text-[var(--ink-2)]">
          SUPER_ADMIN_EMAILS
        </code>
        .
      </p>
    </div>
  );
}
