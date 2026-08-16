import { cache } from "react";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Cloudflare Workers has no long-lived process to hold one global Prisma
// client the way a normal Node server (Railway, Netlify Functions) did —
// every request runs in its own scope, and the database is reached through
// a Hyperdrive binding rather than a plain connection string sitting in
// memory. getDb() builds a client from that request's Hyperdrive binding;
// cache() just makes repeated calls within the SAME request return the
// same instance instead of opening a new connection pool every time.
//
// Every file that used to do `import { prisma } from "@/lib/db"` and use
// `prisma` directly now does `import { getDb } from "@/lib/db"` and calls
// `const prisma = getDb();` as the first line of the function that needs it.
export const getDb = cache(() => {
  const { env } = getCloudflareContext();
  const pool = new Pool({ connectionString: env.HYPERDRIVE.connectionString, max: 5 });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
});
