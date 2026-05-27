import { AdminOrgsView } from "@/components/admin/orgs/AdminOrgsView";
import type {
  AdminOrgRow,
  SubscriptionStatus,
} from "@/components/admin/orgs/types";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Organizations · Admin · SqFt" };

export default async function AdminOrgsPage() {
  // The (admin) layout has already gated this page on isSuperAdmin. We can
  // safely hydrate the initial data here.
  const rows = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      currentPeriodEndsAt: true,
      createdAt: true,
      _count: { select: { users: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // biome-ignore lint/suspicious/noExplicitAny: prisma row shape
  const initial: AdminOrgRow[] = rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    subscriptionStatus: r.subscriptionStatus as SubscriptionStatus,
    trialEndsAt: r.trialEndsAt?.toISOString() ?? null,
    currentPeriodEndsAt: r.currentPeriodEndsAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    userCount: r._count.users,
  }));

  return <AdminOrgsView initial={initial} />;
}
