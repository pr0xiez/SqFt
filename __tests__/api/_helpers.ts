/**
 * Tier-B route test helpers. Routes go through the apiRoute wrapper, which
 * needs a NextRequest-like object with .method and .nextUrl. Construct one
 * from a plain Request here so tests stay terse.
 */

import type { NextRequest } from "next/server";

export function makeRequest(
  method = "GET",
  url = "http://localhost/",
  body?: unknown
): NextRequest {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const req = new Request(url, init);
  Object.defineProperty(req, "nextUrl", {
    value: new URL(url),
    writable: false,
  });
  // biome-ignore lint/suspicious/noExplicitAny: NextRequest shape via duck-typing
  return req as any;
}

export const noParams = { params: Promise.resolve({}) };
export const params = (record: Record<string, string>) => ({
  params: Promise.resolve(record),
});
