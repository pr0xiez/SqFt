/**
 * State + request handling for the test-only mock QBO realm served by
 * app/api/qbo-mock. It emulates just enough of the Accounting API for the
 * sync engine's real port to run end-to-end against the deployed app
 * (Playwright vs the Vercel preview): OAuth, entity CRUD with SyncTokens,
 * DisplayName/Fault semantics, and natural-key queries.
 *
 * Persistence is a JSON blob per realm in Postgres (QboMockRealm) — a
 * per-instance in-memory map would lose state across serverless
 * invocations. Only ever written when QBO_ENVIRONMENT=mock; the routes 404
 * otherwise and refuse to mount in production (lib/qbo/config.ts).
 */

import { prisma } from "@/lib/prisma";

export const MOCK_REALM_ID = "mock-realm-1";
export const MOCK_COMPANY_NAME = "Mock Flooring Co";

export interface MockEntity {
  Id: string;
  SyncToken: string;
  [key: string]: unknown;
}

export interface MockRealmData {
  counter: number;
  customers: MockEntity[];
  invoices: MockEntity[];
  payments: MockEntity[];
  items: MockEntity[];
  accounts: MockEntity[];
  /** Number of upcoming entity writes to fail with a 500 (E2E failure spec). */
  failNextWrites: number;
}

function emptyRealm(): MockRealmData {
  return {
    counter: 1,
    customers: [],
    invoices: [],
    payments: [],
    items: [],
    accounts: [
      {
        Id: "acct-income-1",
        SyncToken: "0",
        Name: "Services",
        AccountType: "Income",
      },
    ],
    failNextWrites: 0,
  };
}

export async function loadRealm(realmId: string): Promise<MockRealmData> {
  const row = await prisma.qboMockRealm.findUnique({ where: { id: realmId } });
  return row ? (row.data as unknown as MockRealmData) : emptyRealm();
}

export async function saveRealm(
  realmId: string,
  data: MockRealmData
): Promise<void> {
  const json = JSON.parse(JSON.stringify(data));
  await prisma.qboMockRealm.upsert({
    where: { id: realmId },
    create: { id: realmId, data: json },
    update: { data: json },
  });
}

export async function resetRealm(realmId: string): Promise<void> {
  await saveRealm(realmId, emptyRealm());
}

export async function armFailures(
  realmId: string,
  count: number
): Promise<void> {
  const data = await loadRealm(realmId);
  data.failNextWrites = count;
  await saveRealm(realmId, data);
}

// ── Responses ───────────────────────────────────────────────────────────────

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function fault(status: number, code: string, message: string): Response {
  return json(
    { Fault: { Error: [{ code, Message: message, Detail: message }] } },
    status
  );
}

// ── Entity handling ─────────────────────────────────────────────────────────

const COLLECTIONS = {
  Customer: "customers",
  Invoice: "invoices",
  Payment: "payments",
  Item: "items",
  Account: "accounts",
} as const;

type EntityName = keyof typeof COLLECTIONS;

function collection(data: MockRealmData, entity: EntityName): MockEntity[] {
  return data[COLLECTIONS[entity]];
}

function nextId(data: MockRealmData): string {
  return String(data.counter++);
}

function invoiceTotal(body: Record<string, unknown>): number {
  const lines = Array.isArray(body.Line)
    ? (body.Line as Array<{ Amount?: number }>)
    : [];
  const tax =
    (body.TxnTaxDetail as { TotalTax?: number } | undefined)?.TotalTax ?? 0;
  return lines.reduce((s, l) => s + (l.Amount ?? 0), 0) + tax;
}

/** POST /v3/company/{realm}/{entity} — create, sparse update, or void. */
export async function handleEntityWrite(
  realmId: string,
  entityPath: string,
  operation: string | null,
  body: Record<string, unknown>
): Promise<Response> {
  const entity = pathToEntity(entityPath);
  if (!entity) return fault(400, "2010", `Unsupported entity ${entityPath}`);

  const data = await loadRealm(realmId);
  if (data.failNextWrites > 0) {
    data.failNextWrites -= 1;
    await saveRealm(realmId, data);
    return fault(500, "3200", "mock realm armed failure");
  }
  const list = collection(data, entity);

  // Void (invoices only): POST /invoice?operation=void with {Id, SyncToken}.
  if (operation === "void") {
    const existing = list.find((e) => e.Id === body.Id);
    if (!existing) return fault(400, "610", "Object Not Found");
    if (existing.SyncToken !== body.SyncToken) {
      return fault(400, "5010", "Stale Object Error");
    }
    existing.voided = true;
    existing.SyncToken = String(Number(existing.SyncToken) + 1);
    await saveRealm(realmId, data);
    return json({ [entity]: existing });
  }

  // Update: body carries Id + SyncToken.
  if (typeof body.Id === "string") {
    const existing = list.find((e) => e.Id === body.Id);
    if (!existing) return fault(400, "610", "Object Not Found");
    if (existing.SyncToken !== body.SyncToken) {
      return fault(400, "5010", "Stale Object Error");
    }
    const { Id: _id, SyncToken: _st, sparse: _sp, ...fields } = body;
    Object.assign(existing, fields);
    existing.SyncToken = String(Number(existing.SyncToken) + 1);
    await saveRealm(realmId, data);
    return json({ [entity]: existing });
  }

  // Create. DisplayName uniqueness mirrors QBO's realm-wide rule.
  if (
    entity === "Customer" &&
    list.some((c) => c.DisplayName === body.DisplayName)
  ) {
    return fault(400, "6240", "Duplicate Name Exists Error");
  }
  const created: MockEntity = {
    ...body,
    Id: nextId(data),
    SyncToken: "0",
    ...(entity === "Invoice" ? { TotalAmt: invoiceTotal(body) } : {}),
  };
  list.push(created);
  await saveRealm(realmId, data);
  return json({ [entity]: created });
}

/** GET /v3/company/{realm}/{entity}/{id} */
export async function handleEntityRead(
  realmId: string,
  entityPath: string,
  id: string
): Promise<Response> {
  const entity = pathToEntity(entityPath);
  if (!entity) return fault(400, "2010", `Unsupported entity ${entityPath}`);
  const data = await loadRealm(realmId);
  const existing = collection(data, entity).find((e) => e.Id === id);
  if (!existing) return fault(400, "610", "Object Not Found");
  return json({ [entity]: existing });
}

/** GET /v3/company/{realm}/query?query=select * from X where F = 'v' */
export async function handleQuery(
  realmId: string,
  query: string
): Promise<Response> {
  const match = query.match(
    /select \* from (\w+)(?: where (\w+) = '((?:[^'\\]|\\.)*)')?/i
  );
  if (!match) return fault(400, "4000", `Unparseable query: ${query}`);
  const [, entityName, field, rawValue] = match;
  const entity = entityName as EntityName;
  if (!(entity in COLLECTIONS)) {
    return fault(400, "4001", `Unknown entity ${entityName}`);
  }

  const data = await loadRealm(realmId);
  let rows = collection(data, entity).filter((e) => e.voided !== true);
  if (field && rawValue !== undefined) {
    const value = rawValue.replace(/\\(['\\])/g, "$1");
    rows = rows.filter((e) => e[field] === value);
  }
  return json({ QueryResponse: { [entity]: rows.slice(0, 1000) } });
}

function pathToEntity(path: string): EntityName | null {
  switch (path) {
    case "customer":
      return "Customer";
    case "invoice":
      return "Invoice";
    case "payment":
      return "Payment";
    case "item":
      return "Item";
    case "account":
      return "Account";
    default:
      return null;
  }
}
