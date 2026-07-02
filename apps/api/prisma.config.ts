// Prisma v7 configuration
// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: In Prisma v7, directUrl is removed from schema.prisma.
//
// For CLI commands (migrate dev, migrate deploy, db push):
//   → datasource.url must point to DIRECT_URL (port 5432, session mode)
//     because DDL requires a direct, non-pooled connection.
//
// For runtime (PrismaClient in application code):
//   → Pass DATABASE_URL (port 6543, transaction pooler) via a driver adapter.
//     This is handled in src/lib/db.ts in Layer 2.
// ─────────────────────────────────────────────────────────────────────────────
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Direct connection — used by Prisma CLI for migrations
    url: process.env["DIRECT_URL"],
  },
});
