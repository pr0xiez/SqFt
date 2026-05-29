// Load .env into process.env for tests that exercise the real Prisma client
// (e.g. repository integration tests). Tests that mock @/lib/prisma are
// unaffected. No-op when DATABASE_URL is already provided by the environment.
import { config } from "dotenv";

if (!process.env.DATABASE_URL) {
  config({ path: ".env" });
}
