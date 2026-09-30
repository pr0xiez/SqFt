import { after } from "next/server";
import { apiRoute } from "@/lib/api/route";
import { getQboConfig } from "@/lib/qbo/config";
import { runQboSyncForOrg } from "@/lib/qbo/runner";
import { getQboConnection, getQboSyncHealth } from "@/lib/repositories/qboRepo";

export interface QboStatusPayload {
  configured: boolean;
  connection: {
    status: string;
    companyName: string | null;
    realmId: string;
    connectedAt: string;
    lastSyncedAt: string | null;
  } | null;
  health: {
    pending: number;
    failed: number;
    done: number;
    pausedAuth: number;
    recentErrors: Array<{
      id: number;
      kind: string;
      entityId: number;
      invoiceId: number | null;
      lastError: string | null;
      updatedAt: string;
      status?: string;
    }>;
  } | null;
}

/** Connection + sync-health summary for the settings card. Viewing it also
 *  opportunistically sweeps the org's due tasks (after the response). */
export const GET = apiRoute({ minRole: "admin" }, async ({ orgId }) => {
  const configured = getQboConfig() !== null;
  if (!configured) {
    return {
      configured,
      connection: null,
      health: null,
    } satisfies QboStatusPayload;
  }
  const connection = await getQboConnection(orgId);
  if (!connection || connection.status === "revoked") {
    return {
      configured,
      connection: null,
      health: null,
    } satisfies QboStatusPayload;
  }
  const health = await getQboSyncHealth(orgId);
  after(() => runQboSyncForOrg(orgId));
  return {
    configured,
    connection: {
      status: connection.status,
      companyName: connection.companyName,
      realmId: connection.realmId,
      connectedAt: connection.connectedAt.toISOString(),
      lastSyncedAt: connection.lastSyncedAt?.toISOString() ?? null,
    },
    health: {
      pending: health.pending,
      failed: health.failed,
      done: health.done,
      pausedAuth: health.pausedAuth,
      recentErrors: health.recentErrors.map((e) => ({
        ...e,
        updatedAt: e.updatedAt.toISOString(),
      })),
    },
  } satisfies QboStatusPayload;
});
