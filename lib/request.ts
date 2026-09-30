/** Request audit metadata. See https://vercel.com/docs/headers/request-headers */
type HeaderSource = { get(name: string): string | null };

function lastAddress(value: string | null): string | null {
  const address = value?.split(",").at(-1)?.trim();
  return !address || address === "unknown" ? null : address;
}

/**
 * Vercel overwrites its forwarding headers; trust platform-specific headers
 * only when actually running there. Outside Vercel, take the rightmost XFF
 * hop appended by a reverse proxy. This fallback is best-effort audit data,
 * not authentication: self-hosted ingress must overwrite or append the peer.
 * Missing/blank data stays null until a non-nullable DB column needs a fallback.
 */
export function getClientIp(headers: HeaderSource): string | null {
  if (process.env.VERCEL === "1") {
    return (
      lastAddress(headers.get("x-vercel-forwarded-for")) ??
      lastAddress(headers.get("x-real-ip")) ??
      lastAddress(headers.get("x-forwarded-for"))
    );
  }
  return lastAddress(headers.get("x-forwarded-for"));
}
