import type { Config } from "@netlify/functions";
import { createHmac } from "node:crypto";

// Must match CRON_TOKEN_LABEL in src/lib/cronAuth.ts (a test fails if they drift).
const CRON_TOKEN_LABEL = "urban-beats-reconcile-v1";

// Every 10 minutes: asks the app to bring any out-of-date Drive backup up to
// date - the guarantee that nothing is left unbacked-up once a teacher's edit
// window has closed. Deliberately tiny: it only knocks on the app's own
// endpoint, so none of the Google libraries are bundled into this function.
export default async () => {
  const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.URL || "").replace(/\/$/, "");
  const secret = process.env.SESSION_SECRET;
  if (!base || !secret) {
    console.log("Drive reconcile skipped: the site URL or SESSION_SECRET isn't available to this function.");
    return;
  }
  const token = createHmac("sha256", secret).update(CRON_TOKEN_LABEL).digest("hex");
  try {
    const res = await fetch(`${base}/api/cron/reconcile`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("Drive reconcile:", res.status, (await res.text()).slice(0, 300));
  } catch (err) {
    console.log("Drive reconcile request failed:", err instanceof Error ? err.message : err);
  }
};

export const config: Config = {
  schedule: "*/10 * * * *",
};
