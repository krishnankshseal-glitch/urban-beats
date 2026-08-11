"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, RefreshCcw, UserX, Search, Phone } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Field, TextInput } from "@/components/ui/Field";
import { Button, PageHeader, EmptyState, InlineAlert, FadeIn } from "@/components/ui/Common";
import { Badge, membershipBadgeVariant, membershipBadgeLabel } from "@/components/ui/Badge";

type ClassRef = { id: string; name: string };
type Student = {
  id: string;
  name: string;
  parentPhone: string | null;
  isActive: boolean;
  membershipStart: string | null;
  membershipMonths: number | null;
  enrollments: { class: ClassRef }[];
};

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [renewing, setRenewing] = useState<Student | null>(null);

  async function load() {
    const [studentsRes, classesRes] = await Promise.all([
      fetch("/api/admin/students"),
      fetch("/api/admin/classes"),
    ]);
    const studentsData = await studentsRes.json();
    const classesData = await classesRes.json();
    setStudents(studentsData.students ?? []);
    setClasses((classesData.classes ?? []).map((c: any) => ({ id: c.id, name: c.name })));
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => (students ?? []).filter((s) => s.name.toLowerCase().includes(query.toLowerCase())),
    [students, query]
  );

  return (
    <div>
      <PageHeader
        title="Students"
        description="Membership status updates automatically — renewing is the only manual step."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Add student
          </Button>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <TextInput
          placeholder="Search students…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="field-input pl-9"
        />
      </div>

      {filtered.length === 0 && students !== null && (
        <EmptyState title="No students found" description="Try a different search, or add a new student." />
      )}

      <div className="glass-card overflow-hidden">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1.5fr_auto] gap-3 border-b border-white/5 px-5 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span>Name</span>
          <span>Parent phone</span>
          <span>Membership</span>
          <span>Classes</span>
          <span />
        </div>
        {filtered.map((s, i) => (
          <FadeIn
            key={s.id}
            delay={Math.min(i * 0.02, 0.3)}
            className="grid grid-cols-[1.5fr_1fr_1fr_1.5fr_auto] items-center gap-3 border-b border-white/5 px-5 py-3 text-sm last:border-0"
          >
            <span className="min-w-0 truncate font-medium text-slate-100">{s.name}</span>
            <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-400">
              {s.parentPhone ? (
                <>
                  <Phone size={13} className="shrink-0" /> <span className="truncate">{s.parentPhone}</span>
                </>
              ) : (
                "—"
              )}
            </span>
            <MembershipCell student={s} />
            <span className="flex flex-wrap gap-1">
              {s.enrollments.map((e) => (
                <Badge key={e.class.id} variant="info">
                  {e.class.name}
                </Badge>
              ))}
            </span>
            <span className="flex justify-end gap-1">
              <Button variant="ghost" className="!px-2 !py-1.5 text-xs" onClick={() => setRenewing(s)}>
                <RefreshCcw size={13} /> Renew
              </Button>
              <Button variant="ghost" className="!px-2 !py-1.5 text-xs" onClick={() => setEditing(s)}>
                <Pencil size={13} />
              </Button>
              {s.isActive && (
                <Button
                  variant="ghost"
                  className="!px-2 !py-1.5 text-xs text-aura-redSoft"
                  onClick={async () => {
                    if (!confirm(`Deactivate ${s.name}?`)) return;
                    await fetch(`/api/admin/students/${s.id}`, { method: "DELETE" });
                    load();
                  }}
                >
                  <UserX size={13} />
                </Button>
              )}
            </span>
          </FadeIn>
        ))}
      </div>

      <StudentFormModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={load} classes={classes} />
      {editing && (
        <StudentFormModal
          open
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          classes={classes}
        />
      )}
      {renewing && (
        <RenewModal student={renewing} onClose={() => setRenewing(null)} onSaved={load} />
      )}
    </div>
  );
}

function MembershipCell({ student }: { student: Student }) {
  const status = computeStatus(student);
  return <Badge variant={membershipBadgeVariant(status)}>{membershipBadgeLabel(status)}</Badge>;
}

function computeStatus(student: Student): string {
  if (!student.membershipStart || !student.membershipMonths) return "NOT_SET";
  const expiry = new Date(student.membershipStart);
  expiry.setMonth(expiry.getMonth() + student.membershipMonths);
  const daysUntil = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysUntil < 0) return "OVERDUE";
  if (daysUntil <= 7) return "DUE_SOON";
  return "ACTIVE";
}

function StudentFormModal({
  open,
  initial,
  onClose,
  onSaved,
  classes,
}: {
  open: boolean;
  initial?: Student;
  onClose: () => void;
  onSaved: () => void;
  classes: ClassRef[];
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [parentPhone, setParentPhone] = useState(initial?.parentPhone ?? "");
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(
    new Set(initial?.enrollments.map((e) => e.class.id) ?? [])
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleClass(id: string) {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const url = initial ? `/api/admin/students/${initial.id}` : "/api/admin/students";
    const res = await fetch(url, {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentPhone, classIds: Array.from(selectedClasses) }),
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
    <Modal open={open} onClose={onClose} title={initial ? `Edit ${initial.name}` : "Add a student"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Student name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Parent's phone number">
          <TextInput value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} />
        </Field>
        <Field label="Classes">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-base-900/80 p-2">
            {classes.length === 0 && <p className="p-2 text-sm text-slate-500">No classes yet.</p>}
            {classes.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5"
              >
                <input
                  type="checkbox"
                  checked={selectedClasses.has(c.id)}
                  onChange={() => toggleClass(c.id)}
                  className="h-4 w-4 rounded accent-aura-blue"
                />
                {c.name}
              </label>
            ))}
          </div>
        </Field>
        {!initial && (
          <p className="text-xs text-slate-500">
            Membership isn't set yet — use "Renew" after creating this student to activate it.
          </p>
        )}
        {error && <InlineAlert>{error}</InlineAlert>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Saving…" : initial ? "Save changes" : "Create student"}
        </Button>
      </form>
    </Modal>
  );
}

function RenewModal({
  student,
  onClose,
  onSaved,
}: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [months, setMonths] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/students/${student.id}/renew`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, months }),
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
    <Modal open onClose={onClose} title={`Renew ${student.name}'s membership`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Start date">
          <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>
        <Field label="Number of months">
          <TextInput
            type="number"
            min={1}
            max={60}
            value={months}
            onChange={(e) => setMonths(Number(e.target.value))}
            required
          />
        </Field>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Saving…" : "Confirm renewal"}
        </Button>
      </form>
    </Modal>
  );
}
