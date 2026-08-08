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
