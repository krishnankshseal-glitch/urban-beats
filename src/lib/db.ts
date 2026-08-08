import { PrismaClient } from "@prisma/client";

// Prevents creating a new Prisma Client on every hot-reload / serverless
// invocation, which would otherwise exhaust the Postgres connection limit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
