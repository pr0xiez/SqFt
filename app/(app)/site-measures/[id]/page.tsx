import { redirect } from "next/navigation";
import { SiteMeasureBuilderView } from "@/components/siteMeasures/SiteMeasureBuilder";
import { hasMinRole, homePathFor } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/tenant";

export const metadata = { title: "Site Measure Builder — SqFt" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SiteMeasureBuilderPage({ params }: Props) {
  const session = await requireSession();
  if (!hasMinRole(session.user.role, "lead"))
    redirect(homePathFor(session.user.role));
  const { id } = await params;
  return <SiteMeasureBuilderView siteMeasureId={parseInt(id, 10)} />;
}
