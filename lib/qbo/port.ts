/**
 * The real QboPort: engine port calls → Accounting API requests via
 * qboFetch. Each call pulls a fresh access context (single-flight refresh
 * behind it, lib/repositories/qboRepo.ts) and retries exactly once on a 401
 * with a forced refresh — after that, auth errors surface and pause the org.
 */

import type { QboAccessContext } from "@/lib/repositories/qboRepo";
import { QboApiError, qboFetch } from "./client";
import { QboAuthDeadError } from "./connect";
import type { QboEntityRef, QboPort } from "./sync";

type ContextProvider = (opts?: {
  force?: boolean;
}) => Promise<QboAccessContext | null>;

/** Escape a value for a QBO query literal ('' and \ are the specials). */
export function escapeQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

interface QboEntityJson {
  Id: string;
  SyncToken: string;
  DisplayName?: string;
  DocNumber?: string;
  TotalAmt?: number;
  Balance?: number;
  CustomerRef?: { value: string };
  Name?: string;
  AccountType?: string;
}

function toRef(entity: QboEntityJson): QboEntityRef {
  return { id: entity.Id, syncToken: entity.SyncToken };
}

export function makeQboPort(getContext: ContextProvider): QboPort {
  async function call(
    method: "GET" | "POST",
    path: string,
    args: { query?: Record<string, string>; body?: unknown } = {}
  ): Promise<unknown> {
    const ctx = await getContext();
    if (!ctx) throw new QboAuthDeadError("no active connection");
    try {
      return await qboFetch({ ...ctx, method, path, ...args });
    } catch (err) {
      if (!(err instanceof QboApiError) || err.kind !== "auth") throw err;
      // One reactive refresh on a 401 (token revoked-and-reissued races,
      // clock skew); a second auth failure is real.
      const fresh = await getContext({ force: true });
      if (!fresh) throw err;
      return qboFetch({ ...fresh, method, path, ...args });
    }
  }

  async function queryOne(
    entity: "Customer" | "Invoice" | "Payment" | "Item" | "Account",
    where: string
  ): Promise<QboEntityJson | null> {
    const body = (await call("GET", "/query", {
      query: {
        query: `select * from ${entity} where ${where} startposition 1 maxresults 1`,
      },
    })) as {
      QueryResponse?: Record<string, QboEntityJson[] | undefined>;
    } | null;
    return body?.QueryResponse?.[entity]?.[0] ?? null;
  }

  async function readEntity(
    entity: "customer" | "invoice",
    id: string
  ): Promise<QboEntityRef | null> {
    try {
      const body = (await call("GET", `/${entity}/${id}`)) as Record<
        string,
        QboEntityJson
      > | null;
      const key = entity === "customer" ? "Customer" : "Invoice";
      const found = body?.[key];
      return found ? toRef(found) : null;
    } catch (err) {
      if (err instanceof QboApiError && err.kind === "not_found") return null;
      throw err;
    }
  }

  async function create(
    path: string,
    key: string,
    body: unknown,
    query?: Record<string, string>
  ): Promise<QboEntityRef> {
    const res = (await call("POST", path, { body, query })) as Record<
      string,
      QboEntityJson
    > | null;
    const entity = res?.[key];
    if (!entity) throw new Error(`QBO ${key} write returned no entity`);
    return toRef(entity);
  }

  return {
    async findCustomerByName(name) {
      const found = await queryOne(
        "Customer",
        `DisplayName = '${escapeQueryValue(name)}'`
      );
      return found
        ? { ...toRef(found), displayName: found.DisplayName ?? name }
        : null;
    },
    createCustomer: (body) => create("/customer", "Customer", body),
    updateCustomer: (body) => create("/customer", "Customer", body),
    readCustomer: (id) => readEntity("customer", id),

    async findInvoiceByDocNumber(docNumber) {
      const found = await queryOne(
        "Invoice",
        `DocNumber = '${escapeQueryValue(docNumber)}'`
      );
      return found
        ? {
            ...toRef(found),
            customerId: found.CustomerRef?.value ?? "",
            totalAmt: found.TotalAmt ?? 0,
          }
        : null;
    },
    createInvoice: (body) => create("/invoice", "Invoice", body),
    readInvoice: (id) => readEntity("invoice", id),
    async readInvoiceBalance(id) {
      const body = (await call("GET", `/invoice/${id}`)) as {
        Invoice?: QboEntityJson;
      };
      const balance = body.Invoice?.Balance;
      if (
        typeof balance !== "number" ||
        !Number.isFinite(balance) ||
        balance < 0
      )
        throw new Error("QuickBooks invoice balance is unavailable");
      return balance;
    },
    voidInvoice: (id, syncToken) =>
      create(
        "/invoice",
        "Invoice",
        { Id: id, SyncToken: syncToken },
        { operation: "void" }
      ),

    async findPaymentByRefNum(refNum) {
      const found = await queryOne(
        "Payment",
        `PaymentRefNum = '${escapeQueryValue(refNum)}'`
      );
      return found ? toRef(found) : null;
    },
    createPayment: (body) => create("/payment", "Payment", body),

    async findItemByName(name) {
      const found = await queryOne(
        "Item",
        `Name = '${escapeQueryValue(name)}'`
      );
      return found ? { id: found.Id } : null;
    },
    async createItem(name) {
      // A Service item posts to an income account, and that choice is what
      // the org's accountant will care about most. Prefer the company's
      // default "Services" income account (present in every QBO company);
      // only then fall back to the first income account QBO returns.
      const services = await queryOne("Account", `Name = 'Services'`);
      const income =
        services?.AccountType === "Income"
          ? services
          : await queryOne("Account", `AccountType = 'Income'`);
      const ref = await create("/item", "Item", {
        Name: name,
        Type: "Service",
        ...(income ? { IncomeAccountRef: { value: income.Id } } : {}),
      });
      return { id: ref.id };
    },
  };
}
