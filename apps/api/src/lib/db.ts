import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// Ensure DATABASE_URL is available
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL must be defined for the application runtime.");
}

// Set up the connection pool using the pg driver adapter.
// This is required in Prisma v7 to use the Supabase transaction-mode pooler (port 6543).
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// Attach PrismaClient to the global object in development to prevent
// exhausting the database connection limit during hot reloads.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
