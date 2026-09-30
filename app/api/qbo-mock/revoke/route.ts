import { isMockQboEnabled } from "@/lib/qbo/config";

export function POST(): Response {
  if (!isMockQboEnabled()) return new Response(null, { status: 404 });
  return new Response(null, { status: 200 });
}
