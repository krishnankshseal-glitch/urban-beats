"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Common";

type Health = {
  state: "ok" | "expiring" | "expired" | "disconnected" | "unconfigured";
  daysLeft: number | null;
};

const DISMISSED_KEY = "driveReconnectDismissedFor";
const RECHECK_MS = 5 * 60 * 1000;

function copyFor(health: Health) {
  if (health.state === "expired") {
    return {
      title: "Google Drive backup has stopped",
      body: "The Google connection has expired, so nothing is being backed up to Drive, and old attendance can't be cleaned up, until you reconnect. Attendance is still being saved here as normal. Reconnecting takes about ten seconds.",
      cta: "Reconnect Google Drive",
    };
  }
  if (health.state === "expiring") {
    const days = health.daysLeft ?? 0;
    const whole = Math.ceil(days);
    const when =
      days <= 0 ? "very soon" : days < 1 ? "in less than a day" : `in about ${whole} day${whole === 1 ? "" : "s"}`;
    return {
      title: "Reconnect Google Drive soon",
      body: `The Google Drive connection expires ${when}. Google disconnects apps that are still in testing every 7 days, and backups stop until it's reconnected. Doing it now takes about ten seconds and restarts the 7 days.`,
      cta: "Reconnect now",
    };
  }
  return {
    title: "Connect Google Drive",
    body: "Attendance backups to Google Drive aren't set up yet. Until they are, nothing is backed up and old attendance is never cleaned up.",
    cta: "Connect Google Drive",
  };
}

/** Admin-only popup: asks to (re)connect Google Drive when it's about to expire,
 * has expired, or was never set up. "Remind me later" hides it for this browser
 * session; it comes back if the situation gets worse (expiring -> expired). */
export function DriveReconnectPrompt() {
  const pathname = usePathname();
  const [health, setHealth] = useState<Health | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/admin/settings/drive/health", { cache: "no-store" });
        if (!res.ok) return;
        const data: Health = await res.json();
        if (cancelled) return;
        setHealth(data);
        const needsAttention =
          data.state === "expired" || data.state === "expiring" || data.state === "disconnected";
        let dismissedFor: string | null = null;
        try {
          dismissedFor = sessionStorage.getItem(DISMISSED_KEY);
        } catch {
          /* private mode etc. - just show it */
        }
        // An expired connection can't be dismissed: the popup stays until it is reconnected.
        setOpen(needsAttention && (data.state === "expired" || dismissedFor !== data.state));
      } catch {
        /* a failed check must never get in the way of using the app */
      }
    }
    check();
    const timer = setInterval(check, RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  function remindLater() {
    try {
      if (health) sessionStorage.setItem(DISMISSED_KEY, health.state);
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!health) return null;
  const copy = copyFor(health);
  // The Settings page already has its own Connect button front and centre.
  const showHere = open && pathname !== "/admin/settings";
  const mustAct = health.state === "expired";

  return (
    <Modal open={showHere} onClose={remindLater} title={copy.title} dismissible={!mustAct}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-400">{copy.body}</p>
        <a href="/api/admin/settings/drive/oauth/start" className="block">
          <Button className="w-full">{copy.cta}</Button>
        </a>
        {!mustAct && (
          <Button variant="ghost" className="w-full" onClick={remindLater}>
            Remind me later
          </Button>
        )}
      </div>
    </Modal>
  );
}
