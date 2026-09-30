import { NotFoundError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { getQboConfig } from "@/lib/qbo/config";
import { revokeToken } from "@/lib/qbo/connect";
import {
  getQboConnection,
  markQboDisconnected,
  readRefreshToken,
} from "@/lib/repositories/qboRepo";

/** User-initiated disconnect: revoke at Intuit and opt out of enqueueing.
 * Reconnect keeps same-company links but discards held opt-out tasks. */
export const POST = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const config = getQboConfig();
  const connection = await getQboConnection(orgId);
  if (!config || !connection) throw new NotFoundError();

  const refreshToken = await readRefreshToken(orgId);
  if (refreshToken) await revokeToken(config, refreshToken);
  await markQboDisconnected(orgId, true);
  return { ok: true };
});
