import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createLineItemTemplate,
  listLineItemTemplates,
} from "@/lib/repositories";
import { getOrgId } from "@/lib/tenant";
import { withLogging } from "@/lib/with-logging";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullish(),
  rate: z.number().min(0).optional(),
  unitLabel: z.string().max(40).optional(),
});

export const GET = withLogging(async (req: NextRequest) => {
  try {
    const orgId = await getOrgId();
    const includeArchived =
      req.nextUrl.searchParams.get("includeArchived") === "1";
    const templates = await listLineItemTemplates(orgId, { includeArchived });
    return NextResponse.json(templates);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
});

export const POST = withLogging(async (req: NextRequest) => {
  try {
    const orgId = await getOrgId();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message },
        { status: 400 }
      );
    }
    const template = await createLineItemTemplate(orgId, parsed.data);
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
});
