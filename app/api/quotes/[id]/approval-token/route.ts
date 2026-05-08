import { type NextRequest, NextResponse } from "next/server";
import { rotateApprovalToken } from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

type RouteParams = { params: Promise<{ id: string }> };

export const POST = withLogging(
  async (_req: NextRequest, { params }: RouteParams) => {
    try {
      const orgId = await getOrgId();
      const { id } = await params;
      const token = await rotateApprovalToken(parseInt(id, 10), orgId);
      if (!token)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ approvalToken: token });
    } catch (err) {
      if (err instanceof Error && err.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
  }
);
