import type { Config } from "@netlify/functions";
// Relative import, not the "@/lib/..." alias: this file is bundled by
// Netlify's own function bundler, not Next.js, so tsconfig path aliases
// aren't available here.
import { runMonthlyPurgeIfDue } from "../../src/lib/attendancePurge";

// Runs daily and no-ops on every day except the 1st of the studio month
// (see runMonthlyPurgeIfDue) - simpler and more robust than trying to
// target an exact once-a-month cron expression against a non-UTC
// timezone, and it means a single missed/delayed invocation on the 1st
// itself still self-corrects the very next day rather than waiting a
// full month.
export default async (req: Request) => {
  const result = await runMonthlyPurgeIfDue();
  console.log("Monthly attendance purge check:", JSON.stringify(result));
};

export const config: Config = {
  schedule: "@daily",
};
