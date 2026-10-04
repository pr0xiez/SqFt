import Link from "next/link";
import { ArrowRightIcon, BuildingsIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { countOrgsForAdmin } from "@/lib/repositories/organizationRepo";
import { countUsersForAdmin } from "@/lib/repositories/userRepo";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Admin" };

export default async function AdminDashboardPage() {
  // Defense-in-depth: the (admin) layout renders ForbiddenPanel for
  // non-super-admins, but Next runs the page body in parallel with the layout,
  // so skip the queries when the caller isn't allowed.
  const session = await requireSession();
  if (!isSuperAdmin(session.user.email)) return null;

  const [orgCount, userCount] = await Promise.all([
    countOrgsForAdmin(),
    countUsersForAdmin(),
  ]);

  return (
    <div className="max-w-[960px]">
      <PageHeader
        title="Admin"
        meta="Operator console for the SqFt platform."
      />

      <div className="card grid grid-cols-2 overflow-hidden mb-6">
        <div className="px-5 py-5 md:px-6 md:py-6 border-r border-[var(--line)]">
          <Stat label="Organizations" value={orgCount} />
        </div>
        <div className="px-5 py-5 md:px-6 md:py-6">
          <Stat label="Users" value={userCount} />
        </div>
      </div>

      <Link
        href="/admin/orgs"
        className="group card flex items-center gap-4 p-5 md:p-6 no-underline text-[var(--ink)] transition-colors hover:bg-[var(--hover)]"
      >
        <span className="flex items-center justify-center size-10 shrink-0 rounded-[var(--r)] bg-[var(--surface-2)] text-[var(--ink-2)]">
          <BuildingsIcon aria-hidden="true" className="size-5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block type-heading">Organizations</span>
          <span className="block mt-0.5 text-[14px] text-[var(--muted)]">
            View every tenant, create manual orgs, and manage members.
          </span>
        </span>
        <ArrowRightIcon
          aria-hidden="true"
          className="size-5 shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--ink)]"
        />
      </Link>
    </div>
  );
}
