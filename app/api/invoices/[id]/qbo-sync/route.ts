import { after } from "next/server";
import {
  NotFoundError,
  QboAuthExpiredError,
  QboNotConnectedError,
} from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/route";
import { invoiceIdParams } from "@/lib/invoices/schema";
import { runQboSyncForOrg } from "@/lib/qbo/runner";
import {
  getQboConnection,
  requeueInvoiceSync,
} from "@/lib/repositories/qboRepo";

/** Manual "Sync now" / retry for one invoice (and its payments). */
export const POST = apiRoute({ minRole: "lead" }, async ({ orgId, params }) => {
  const { id } = invoiceIdParams.parse(params);
  const connection = await getQboConnection(orgId);
  if (!connection) throw new QboNotConnectedError();
  if (connection.status !== "active") throw new QboAuthExpiredError();

  const found = await requeueInvoiceSync(orgId, id);
  if (!found) throw new NotFoundError();
  after(() => runQboSyncForOrg(orgId));
  return { ok: true };
});
