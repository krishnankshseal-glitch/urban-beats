"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HardDriveDownload, KeyRound, Clock, ExternalLink, LogOut } from "lucide-react";
import { Field, TextInput } from "@/components/ui/Field";
import { Button, PageHeader, InlineAlert, FadeIn } from "@/components/ui/Common";
import { Badge } from "@/components/ui/Badge";

type DriveStatus = {
  connected: boolean;
  oauthConfigured: boolean;
  connectedEmail: string | null;
  rootFolder: { id: string; webViewLink: string | null } | null;
  connection: { ok: boolean; message: string } | null;
};

type PurgeStatus = { heartbeatAt: string | null; lastRunMonth: string | null };

export default function SettingsPage() {
  const router = useRouter();

  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [purgeStatus, setPurgeStatus] = useState<PurgeStatus | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [callbackNotice, setCallbackNotice] = useState<{ ok: boolean; message: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordResult, setPasswordResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordResult(null);
    if (newPassword !== confirmPassword) {
      setPasswordResult({ ok: false, message: "New passwords don't match." });
      return;
    }
    setChangingPassword(true);
    const res = await fetch("/api/auth/change-password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setChangingPassword(false);
    if (!res.ok) {
      setPasswordResult({ ok: false, message: data.error ?? "Something went wrong." });
      return;
    }
    setPasswordResult({ ok: true, message: "Password changed. Your other logged-in devices have been signed out." });
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  async function load() {
    const [driveRes, purgeRes] = await Promise.all([
      fetch("/api/admin/settings/drive"),
      fetch("/api/admin/settings/purge-status"),
    ]);
    setStatus(await driveRes.json());
    setPurgeStatus(await purgeRes.json());
  }

  useEffect(() => {
    load();
  }, []);

  // Reflect the OAuth callback's redirect params once, then clean the URL
  // so a refresh doesn't re-show a stale "connected!" banner.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("drive_connected");
    const error = params.get("drive_error");
    if (connected) setCallbackNotice({ ok: true, message: "Google Drive connected." });
    else if (error) setCallbackNotice({ ok: false, message: error });
    if (connected || error) router.replace("/admin/settings");
  }, [router]);

  async function handleDisconnect() {
    setDisconnecting(true);
    await fetch("/api/admin/settings/drive/disconnect", { method: "POST" });
    setDisconnecting(false);
    setCallbackNotice(null);
    load();
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="Settings" description="Connect Google Drive for automatic attendance backups." />

      <FadeIn className="glass-card space-y-5 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
            <HardDriveDownload size={18} className="text-aura-blueSoft" />
          </div>
          <div>
            <p className="font-medium text-slate-100">Google Drive backup</p>
            <p className="text-xs text-slate-500">Attendance syncs here automatically on every submission.</p>
          </div>
        </div>

        {status && !status.oauthConfigured && (
          <InlineAlert>
            Drive OAuth isn't set up yet. Add GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and
            NEXT_PUBLIC_APP_URL in your hosting provider's environment variables first.
          </InlineAlert>
        )}

        {callbackNotice && (
          <InlineAlert kind={callbackNotice.ok ? "success" : "error"}>{callbackNotice.message}</InlineAlert>
        )}

        {status?.oauthConfigured && !status.connected && (
          <a href="/api/admin/settings/drive/oauth/start">
            <Button className="w-full">Connect Google Drive</Button>
          </a>
        )}

        {status?.connected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-base-900/80 px-3 py-2.5 text-sm">
              <span className="text-slate-400">Connected as</span>
              <span className="truncate text-slate-200">{status.connectedEmail}</span>
            </div>
            {status.rootFolder?.webViewLink && (
              <a
                href={status.rootFolder.webViewLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs text-aura-blueSoft hover:underline"
              >
                Open the backup folder in Drive <ExternalLink size={12} />
              </a>
            )}
            {status.connection && (
              <div className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-2.5 text-sm">
                <span className="text-slate-400">Current status</span>
                <Badge variant={status.connection.ok ? "active" : "overdue"}>
                  {status.connection.ok ? "Working" : "Problem"}
                </Badge>
              </div>
            )}
            {status.connection && !status.connection.ok && (
              <InlineAlert>{status.connection.message}</InlineAlert>
            )}
            <Button variant="ghost" onClick={handleDisconnect} disabled={disconnecting} className="w-full">
              <LogOut size={14} /> {disconnecting ? "Disconnecting…" : "Disconnect"}
            </Button>
          </div>
        )}
      </FadeIn>

      <FadeIn className="glass-card mt-6 space-y-3 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
            <Clock size={18} className="text-aura-blueSoft" />
          </div>
          <div>
            <p className="font-medium text-slate-100">Automated attendance purge</p>
            <p className="text-xs text-slate-500">
              Runs monthly. Deletes attendance older than 2 months, only once it's confirmed backed up to Drive.
            </p>
          </div>
        </div>
        <PurgeHeartbeat status={purgeStatus} />
      </FadeIn>

      <FadeIn className="glass-card mt-6 space-y-4 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
            <KeyRound size={18} className="text-aura-redSoft" />
          </div>
          <div>
            <p className="font-medium text-slate-100">Change your password</p>
            <p className="text-xs text-slate-500">Changing it signs you out on every other device.</p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3">
          <Field label="Current password">
            <TextInput
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="New password" hint="At least 8 characters.">
            <TextInput
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </Field>
          <Field label="Confirm new password">
            <TextInput
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </Field>
          {passwordResult && (
            <InlineAlert kind={passwordResult.ok ? "success" : "error"}>{passwordResult.message}</InlineAlert>
          )}
          <Button type="submit" disabled={changingPassword} className="w-full">
            {changingPassword ? "Updating…" : "Update password"}
          </Button>
        </form>
      </FadeIn>
    </div>
  );
}

// The scheduled function that runs this is a real infrastructure dependency
// (Netlify Scheduled Functions), not something this app controls directly -
// this makes its own proof-of-life visible here instead of asking anyone to
// trust silently that it's firing. It writes a fresh heartbeat every single
// day regardless of whether that day's run actually did anything, so a
// heartbeat much older than a day or two is itself the signal something's
// wrong with the schedule - not a guess about what it's supposed to do.
function PurgeHeartbeat({ status }: { status: PurgeStatus | null }) {
  if (!status) return null;

  if (!status.heartbeatAt) {
    return (
      <InlineAlert>
        No heartbeat yet — this appears once the scheduled function has run at least once after deploy.
      </InlineAlert>
    );
  }

  const hoursSince = (Date.now() - new Date(status.heartbeatAt).getTime()) / (1000 * 60 * 60);
  const healthy = hoursSince < 36; // runs daily; give it a bit of slack over 24h

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-2.5">
        <span className="text-slate-400">Last check-in</span>
        <div className="flex items-center gap-2">
          <span className="text-slate-300">{new Date(status.heartbeatAt).toLocaleString()}</span>
          <Badge variant={healthy ? "active" : "overdue"}>{healthy ? "Healthy" : "Stale"}</Badge>
        </div>
      </div>
      {!healthy && (
        <InlineAlert>
          No check-in in over a day. The schedule may not be registered — check the Functions tab in Netlify for{" "}
          <code className="text-xs">monthly-attendance-purge</code>, and use its "Run now" button to confirm it
          works end to end.
        </InlineAlert>
      )}
      <div className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-2.5">
        <span className="text-slate-400">Last month purged</span>
        <span className="text-slate-300">{status.lastRunMonth ?? "None yet"}</span>
      </div>
    </div>
  );
}
