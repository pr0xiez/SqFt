import { AdminOrgsView } from "@/components/admin/orgs/AdminOrgsView";
import type {
  AdminOrgRow,
  SubscriptionStatus,
} from "@/components/admin/orgs/types";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { listAllOrgsForAdmin } from "@/lib/repositories/organizationRepo";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Organizations" };

export default async function AdminOrgsPage() {
  // Defense-in-depth: the (admin) layout already renders ForbiddenPanel for
  // non-super-admins, but Next runs the page's async body in parallel with
  // the layout. Skip the DB query when the caller isn't allowed.
  const session = await requireSession();
  if (!isSuperAdmin(session.user.email)) {
    return <AdminOrgsView initial={[]} />;
  }

  const rows = await listAllOrgsForAdmin();

  const initial: AdminOrgRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    subscriptionStatus: r.subscriptionStatus as SubscriptionStatus,
    trialEndsAt: r.trialEndsAt?.toISOString() ?? null,
    currentPeriodEndsAt: r.currentPeriodEndsAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    userCount: r.userCount,
  }));

  return <AdminOrgsView initial={initial} />;
}
