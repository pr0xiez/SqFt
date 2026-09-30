import Link from "next/link";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { countOrgsForAdmin } from "@/lib/repositories/organizationRepo";
import { countUsersForAdmin } from "@/lib/repositories/userRepo";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Admin · SqFt" };

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
    <div className="max-w-[960px] mx-auto px-4 py-8">
      <h1 className="text-[24px] font-[700] tracking-[-0.02em] mb-1">Admin</h1>
      <p className="text-[13px] text-[var(--muted)] mb-6">
        Operator console for the SqFt platform.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Stat label="Organizations" value={orgCount} />
        <Stat label="Users" value={userCount} />
      </div>

      <Link
        href="/admin/orgs"
        className="block border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4 hover:bg-[var(--surface-2)]"
      >
        <div className="text-[15px] font-[600]">Organizations →</div>
        <div className="text-[13px] text-[var(--muted)]">
          View every tenant, create manual orgs, and manage members.
        </div>
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[var(--line)] rounded-[var(--r)] bg-[var(--surface)] p-4">
      <div className="text-[10px] font-[var(--font-mono)] tracking-[.06em] uppercase text-[var(--muted)] mb-1">
        {label}
      </div>
      <div className="text-[28px] font-[700] tracking-[-0.02em]">{value}</div>
    </div>
  );
}
