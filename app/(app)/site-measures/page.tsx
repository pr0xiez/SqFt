import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SiteMeasureListView } from "@/components/siteMeasures/SiteMeasureList";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Site Measures" };

export default async function SiteMeasuresPage() {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  return (
    <Suspense fallback={null}>
      <SiteMeasureListView />
    </Suspense>
  );
}
