import type { Config } from "@netlify/functions";
// Relative import - see the note in monthly-attendance-purge.mts for why.
import { markMissedDaysAsHolidays } from "../../src/lib/holidayDetection";

export default async (req: Request) => {
  const result = await markMissedDaysAsHolidays();
  console.log("Holiday auto-detection check:", JSON.stringify(result));
};

export const config: Config = {
  schedule: "@daily",
};
