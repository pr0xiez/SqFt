import { UnauthorizedError } from "@/lib/api/errors";
import { requireSession } from "@/lib/tenant";
import type { SendActor } from "./pipeline";

/**
 * Resolve the authenticated sender identity for a send. Lives apart from
 * pipeline.ts so the spine stays session-free (callable from a future
 * cron/batch context that has no request).
 */
export async function requireSender(): Promise<SendActor> {
  const session = await requireSession();
  const user = session.user;
  if (!user?.email || !user?.name) throw new UnauthorizedError();
  return { email: user.email, name: user.name };
}
