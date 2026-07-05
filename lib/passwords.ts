/** Generate a random 16-char temporary password from an unambiguous alphabet. */
export function suggestPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const out: string[] = [];
  const cryptoObj =
    typeof crypto !== "undefined" && "getRandomValues" in crypto
      ? crypto
      : null;
  if (cryptoObj) {
    const buf = new Uint32Array(16);
    cryptoObj.getRandomValues(buf);
    for (const n of buf) out.push(alphabet[n % alphabet.length] ?? "x");
  } else {
    for (let i = 0; i < 16; i++) {
      out.push(alphabet[Math.floor(Math.random() * alphabet.length)] ?? "x");
    }
  }
  return out.join("");
}
