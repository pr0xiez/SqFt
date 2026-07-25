import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { getQboConfig } from "@/lib/qbo/config";
import { revokeToken } from "@/lib/qbo/connect";
import {
  getQboConnection,
  markQboDisconnected,
  readRefreshToken,
} from "@/lib/repositories/qboRepo";

/** User-initiated disconnect: best-effort revoke at Intuit, then mark the
 *  connection disconnected (pending tasks pause; nothing is deleted, so
 *  reconnecting to the same company resumes cleanly). */
export const POST = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const config = getQboConfig();
  const connection = await getQboConnection(orgId);
  if (!config || !connection) throw new NotFoundError();

  const refreshToken = await readRefreshToken(orgId);
  if (refreshToken) await revokeToken(config, refreshToken);
  await markQboDisconnected(orgId);
  return { ok: true };
});
