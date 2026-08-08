"use client";

import { useEffect, useState } from "react";
import { Plus, ShieldCheck, UserX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Field, TextInput } from "@/components/ui/Field";
import { Button, PageHeader, InlineAlert, FadeIn } from "@/components/ui/Common";
import { Badge } from "@/components/ui/Badge";

type Admin = { id: string; username: string; isActive: boolean; createdAt: string };

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    const [adminsRes, meRes] = await Promise.all([fetch("/api/admin/admins"), fetch("/api/auth/me")]);
    const adminsData = await adminsRes.json();
    const meData = await meRes.json();
    setAdmins(adminsData.admins ?? []);
    setCurrentUserId(meData.userId ?? null);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Admins"
        description="All admins have equal, full access. Anyone here can create another admin."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Add admin
          </Button>
        }
      />

      {actionError && <div className="mb-4"><InlineAlert>{actionError}</InlineAlert></div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {admins?.map((a, i) => (
          <FadeIn key={a.id} delay={i * 0.04} className="glass-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
                  <ShieldCheck size={18} className="text-aura-blueSoft" />
                </div>
                <div>
                  <p className="font-medium text-slate-100">@{a.username}</p>
                  <p className="text-xs text-slate-500">
                    Since {new Date(a.createdAt).toLocaleDateString()}
                    {a.id === currentUserId && " · you"}
                  </p>
                </div>
              </div>
              <Badge variant={a.isActive ? "active" : "neutral"}>{a.isActive ? "Active" : "Inactive"}</Badge>
            </div>
            {a.isActive && a.id !== currentUserId && (
              <Button
                variant="ghost"
                className="mt-4 !px-2 text-xs text-aura-redSoft"
                onClick={async () => {
                  if (!confirm(`Deactivate admin @${a.username}?`)) return;
                  setActionError(null);
                  const res = await fetch(`/api/admin/admins/${a.id}`, { method: "DELETE" });
                  if (!res.ok) {
                    setActionError((await res.json()).error ?? "Couldn't deactivate that admin.");
                    return;
                  }
                  load();
                }}
              >
                <UserX size={14} /> Deactivate
              </Button>
            )}
          </FadeIn>
        ))}
      </div>

      <CreateAdminModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
    </div>
  );
}

function CreateAdminModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Something went wrong.");
      return;
    }
    setUsername("");
    setPassword("");
    onClose();
    onCreated();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add an admin" description="They'll have full, equal access.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Username">
          <TextInput value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} required />
        </Field>
        <Field label="Password">
          <TextInput
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </Field>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Creating…" : "Create admin"}
        </Button>
      </form>
    </Modal>
  );
}
