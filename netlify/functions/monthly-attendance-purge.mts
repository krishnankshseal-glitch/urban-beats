import type { Config } from "@netlify/functions";
// Relative import, not the "@/lib/..." alias: this file is bundled by
// Netlify's own function bundler, not Next.js, so tsconfig path aliases
// aren't available here. Deliberately only imports the database-side purge
// code - nothing that pulls in the Google libraries - so this stays small.
import { runDailyPurge } from "../../src/lib/attendancePurge";

// Runs daily. Attendance older than the current + previous month is deleted
// once its Drive backup is confirmed; on most days there is nothing to do.
// Running daily rather than once a month means a class-month that couldn't be
// confirmed one day is picked up as soon as its backup catches up, and a
// single missed invocation can never delay the purge by a month.
export default async (req: Request) => {
  const result = await runDailyPurge();
  console.log("Attendance purge check:", JSON.stringify(result));
};

export const config: Config = {
  schedule: "@daily",
};
