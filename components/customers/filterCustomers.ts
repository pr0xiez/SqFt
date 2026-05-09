export type CustomerFilterInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  source: string;
};

export function filterCustomers<T extends CustomerFilterInput>(
  customers: T[],
  query: string,
  source: string
): T[] {
  const q = query.trim().toLowerCase();
  return customers.filter((c) => {
    if (q.length > 0) {
      const fields: (string | null | undefined)[] = [
        c.name,
        c.phone,
        c.email,
        c.address,
      ];
      const hit = fields.some(
        (f) => typeof f === "string" && f.toLowerCase().includes(q)
      );
      if (!hit) return false;
    }
    if (source !== "all" && c.source !== source) return false;
    return true;
  });
}
