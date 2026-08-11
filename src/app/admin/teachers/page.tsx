"use client";

import { useEffect, useState } from "react";
import { Plus, GraduationCap, Pencil, KeyRound, UserX } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Field, TextInput } from "@/components/ui/Field";
import { Button, PageHeader, EmptyState, InlineAlert, FadeIn } from "@/components/ui/Common";
import { Badge } from "@/components/ui/Badge";

type Teacher = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  monthlySalary: number | null;
  isActive: boolean;
  user: { username: string; isActive: boolean };
  classes: { id: string; name: string }[];
};

function formatSalary(amount: number | null) {
  if (amount === null) return "Not set";
  return `${amount.toLocaleString()} / month`;
}

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [resetting, setResetting] = useState<Teacher | null>(null);

  async function load() {
    const res = await fetch("/api/admin/teachers");
    const data = await res.json();
    setTeachers(data.teachers ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Teachers"
        description="Every teacher account is created here — teachers never sign up themselves."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Add teacher
          </Button>
        }
      />

      {teachers === null && <p className="text-sm text-slate-500">Loading…</p>}

      {teachers?.length === 0 && (
        <EmptyState
          title="No teachers yet"
          description="Add your first teacher to start assigning classes."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teachers?.map((t, i) => (
          <FadeIn key={t.id} delay={i * 0.04} className="glass-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                  <GraduationCap size={18} className="text-aura-blueSoft" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-100">{t.name}</p>
                  <p className="truncate text-xs text-slate-500">@{t.user.username}</p>
                </div>
              </div>
              <Badge variant={t.isActive ? "active" : "neutral"}>
                {t.isActive ? "Active" : "Inactive"}
              </Badge>
            </div>

            <div className="mt-3 flex items-center gap-1.5 text-xs">
              <span className="text-slate-500">Salary:</span>
              <span className={t.monthlySalary === null ? "text-slate-500" : "font-mono-data text-slate-200"}>
                {formatSalary(t.monthlySalary)}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {t.classes.length === 0 && <span className="text-xs text-slate-500">No classes assigned</span>}
              {t.classes.map((c) => (
                <Badge key={c.id} variant="info">
                  {c.name}
                </Badge>
              ))}
            </div>

            <div className="mt-4 flex gap-2 border-t border-white/5 pt-4">
              <Button variant="ghost" className="!px-2 text-xs" onClick={() => setEditing(t)}>
                <Pencil size={14} /> Edit
              </Button>
              <Button variant="ghost" className="!px-2 text-xs" onClick={() => setResetting(t)}>
                <KeyRound size={14} /> Reset password
              </Button>
              {t.isActive && (
                <Button
                  variant="ghost"
                  className="!px-2 text-xs text-aura-redSoft"
                  onClick={async () => {
                    if (!confirm(`Deactivate ${t.name}? Their classes will become unassigned.`)) return;
                    await fetch(`/api/admin/teachers/${t.id}`, { method: "DELETE" });
                    load();
                  }}
                >
                  <UserX size={14} /> Deactivate
                </Button>
              )}
            </div>
          </FadeIn>
        ))}
      </div>

      <CreateTeacherModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      {editing && (
        <EditTeacherModal teacher={editing} onClose={() => setEditing(null)} onSaved={load} />
      )}
      {resetting && (
        <ResetPasswordModal teacher={resetting} onClose={() => setResetting(null)} onSaved={load} />
      )}
    </div>
  );
}

function CreateTeacherModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setName("");
    setUsername("");
    setPassword("");
    setEmail("");
    setPhone("");
    setMonthlySalary("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        username,
        password,
        email,
        phone,
        monthlySalary: monthlySalary === "" ? null : Number(monthlySalary),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      return;
    }
    reset();
    onClose();
    onCreated();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a teacher" description="They'll use this username and password to log in.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email (optional)">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Phone (optional)">
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <Field label="Monthly salary (optional)" hint="Visible to admins only — teachers never see this.">
          <TextInput
            type="number"
            min={0}
            inputMode="numeric"
            value={monthlySalary}
            onChange={(e) => setMonthlySalary(e.target.value)}
          />
        </Field>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Creating…" : "Create teacher"}
        </Button>
      </form>
    </Modal>
  );
}

function EditTeacherModal({
  teacher,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(teacher.name);
  const [email, setEmail] = useState(teacher.email ?? "");
  const [phone, setPhone] = useState(teacher.phone ?? "");
  const [monthlySalary, setMonthlySalary] = useState(
    teacher.monthlySalary === null ? "" : String(teacher.monthlySalary)
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/teachers/${teacher.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        phone,
        monthlySalary: monthlySalary === "" ? null : Number(monthlySalary),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Something went wrong.");
      return;
    }
    onClose();
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${teacher.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Phone">
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <Field label="Monthly salary" hint="Visible to admins only — teachers never see this.">
          <TextInput
            type="number"
            min={0}
            inputMode="numeric"
            value={monthlySalary}
            onChange={(e) => setMonthlySalary(e.target.value)}
          />
        </Field>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  teacher,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/teachers/${teacher.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Something went wrong.");
      return;
    }
    onClose();
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={`Reset password for ${teacher.name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="New password" hint="Share this with the teacher directly.">
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
          {loading ? "Saving…" : "Set new password"}
        </Button>
      </form>
    </Modal>
  );
}
