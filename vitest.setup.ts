// Load .env into process.env for tests that exercise the real Prisma client
// (e.g. repository integration tests). Tests that mock @/lib/prisma are
// unaffected. No-op when DATABASE_URL is already provided by the environment.
import { config } from "dotenv";

if (!process.env.DATABASE_URL) {
  config({ path: ".env" });
}

// Record whether a REAL database is reachable (a DATABASE_URL came from the
// environment or .env). Integration tests gate on this via
// `describe.skipIf(!process.env.VITEST_DB_AVAILABLE)` so they run locally and
// skip in CI's DB-less unit job (where DB behavior is covered by e2e).
if (process.env.DATABASE_URL) {
  process.env.VITEST_DB_AVAILABLE = "1";
}

// `lib/prisma.ts` builds its client eagerly at import and throws without a
// URL — which would crash any file that imports it, even when its DB-touching
// `describe` blocks are skipped. Provide a stub so the client constructs;
// PrismaPg is lazy and never connects unless a query actually runs (and the
// integration tests skip their queries when VITEST_DB_AVAILABLE is unset).
// Mirrors the stub used by the CI build job in pr.yml.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://ci:ci@localhost:5432/ci";
}
