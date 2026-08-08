"use client";

import { useEffect, useState } from "react";
import { Copy, Check, HardDriveDownload } from "lucide-react";
import { Field, TextInput } from "@/components/ui/Field";
import { Button, PageHeader, InlineAlert, FadeIn } from "@/components/ui/Common";
import { Badge } from "@/components/ui/Badge";

type DriveStatus = {
  serviceAccountEmail: string | null;
  credentialsConfigured: boolean;
  rootFolderId: string | null;
  connection: { ok: boolean; message: string } | null;
};

export default function SettingsPage() {
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [folderId, setFolderId] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/settings/drive");
    const data = await res.json();
    setStatus(data);
    setFolderId(data.rootFolderId ?? "");
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    const res = await fetch("/api/admin/settings/drive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId }),
    });
    const data = await res.json();
    setSaving(false);
    setResult(res.ok ? { ok: true, message: data.message } : { ok: false, message: data.error });
    if (res.ok) load();
  }

  function copyEmail() {
    if (!status?.serviceAccountEmail) return;
    navigator.clipboard.writeText(status.serviceAccountEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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

        {status && !status.credentialsConfigured && (
          <InlineAlert>
            Service account credentials aren't set yet. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and
            GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in Vercel's environment variables first.
          </InlineAlert>
        )}

        {status?.serviceAccountEmail && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-400">
              1. Share your Drive folder with this email, as Editor
            </p>
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-base-900/80 px-3 py-2.5">
              <code className="flex-1 truncate text-xs text-slate-300">{status.serviceAccountEmail}</code>
              <button onClick={copyEmail} className="text-slate-400 hover:text-white">
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          <Field
            label="2. Paste the folder's ID"
            hint="From the folder's URL: drive.google.com/drive/folders/THIS_PART"
          >
            <TextInput value={folderId} onChange={(e) => setFolderId(e.target.value)} required />
          </Field>
          {result && <InlineAlert kind={result.ok ? "success" : "error"}>{result.message}</InlineAlert>}
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Testing connection…" : "Save & test connection"}
          </Button>
        </form>

        {status?.rootFolderId && status.connection && (
          <div className="flex items-center justify-between rounded-xl border border-white/5 px-3 py-2.5 text-sm">
            <span className="text-slate-400">Current status</span>
            <Badge variant={status.connection.ok ? "active" : "overdue"}>
              {status.connection.ok ? "Connected" : "Not connected"}
            </Badge>
          </div>
        )}
      </FadeIn>
    </div>
  );
}
