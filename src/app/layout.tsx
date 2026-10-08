import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Urban Beats — Attendance",
  description: "Attendance, classes, and rosters for Urban Beats dance studio.",
  // Google Search Console's HTML-tag ownership verification - set
  // GOOGLE_SITE_VERIFICATION to the content value Search Console gives you
  // (not the whole meta tag, just the value) and redeploy. Harmless and
  // inert if the env var is unset.
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <div className="aura-backdrop">
          <div className="aura-orb blue" />
          <div className="aura-orb red" />
        </div>
        <div className="relative z-10 min-h-screen">{children}</div>
      </body>
    </html>
  );
}
