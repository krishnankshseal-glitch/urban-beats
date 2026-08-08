"use client";

import { useEffect, useState } from "react";
import { Plus, CalendarCheck2, Pencil, Users, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Field, TextInput, TextArea, Select } from "@/components/ui/Field";
import { Button, PageHeader, EmptyState, InlineAlert, FadeIn } from "@/components/ui/Common";
import { Badge } from "@/components/ui/Badge";

type Teacher = { id: string; name: string };
type Student = { id: string; name: string; isActive: boolean };
type ClassItem = {
  id: string;
  name: string;
  schedule: string | null;
  description: string | null;
  isActive: boolean;
  teacher: { id: string; name: string } | null;
  enrollments: { student: Student }[];
};

export default function ClassesPage() {
  const [classes, setClasses] = useState<ClassItem[] | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ClassItem | null>(null);
  const [rosterFor, setRosterFor] = useState<ClassItem | null>(null);

  async function load() {
    const [classesRes, teachersRes, studentsRes] = await Promise.all([
      fetch("/api/admin/classes"),
      fetch("/api/admin/teachers"),
      fetch("/api/admin/students"),
    ]);
    const classesData = await classesRes.json();
    const teachersData = await teachersRes.json();
    const studentsData = await studentsRes.json();
    setClasses(classesData.classes ?? []);
    setTeachers((teachersData.teachers ?? []).filter((t: any) => t.isActive));
    setStudents((studentsData.students ?? []).filter((s: any) => s.isActive));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="Classes"
        description="Assign a teacher to each class, then build its roster."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Add class
          </Button>
        }
      />

      {classes?.length === 0 && (
        <EmptyState title="No classes yet" description="Add your first class to get started." />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {classes?.map((c, i) => (
          <FadeIn key={c.id} delay={i * 0.04} className="glass-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5">
                  <CalendarCheck2 size={18} className="text-aura-redSoft" />
                </div>
                <div>
                  <p className="font-medium text-slate-100">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.schedule || "No schedule set"}</p>
                </div>
              </div>
              <Badge variant={c.isActive ? "active" : "neutral"}>{c.isActive ? "Active" : "Inactive"}</Badge>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Teacher: <span className="text-slate-300">{c.teacher?.name ?? "Unassigned"}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {c.enrollments.length} student{c.enrollments.length === 1 ? "" : "s"} enrolled
            </p>

            <div className="mt-4 flex gap-2 border-t border-white/5 pt-4">
              <Button variant="ghost" className="!px-2 text-xs" onClick={() => setEditing(c)}>
                <Pencil size={14} /> Edit
              </Button>
              <Button variant="ghost" className="!px-2 text-xs" onClick={() => setRosterFor(c)}>
                <Users size={14} /> Roster
              </Button>
              {c.isActive && (
                <Button
                  variant="ghost"
                  className="!px-2 text-xs text-aura-redSoft"
                  onClick={async () => {
                    if (!confirm(`Deactivate "${c.name}"?`)) return;
                    await fetch(`/api/admin/classes/${c.id}`, { method: "DELETE" });
                    load();
                  }}
                >
                  <Trash2 size={14} /> Deactivate
                </Button>
              )}
            </div>
          </FadeIn>
        ))}
      </div>

      <ClassFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={load}
        teachers={teachers}
      />
      {editing && (
        <ClassFormModal
          open
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          teachers={teachers}
        />
      )}
      {rosterFor && (
        <RosterModal cls={rosterFor} students={students} onClose={() => setRosterFor(null)} onSaved={load} />
      )}
    </div>
  );
}

function ClassFormModal({
  open,
  initial,
  onClose,
  onSaved,
  teachers,
}: {
  open: boolean;
  initial?: ClassItem;
  onClose: () => void;
  onSaved: () => void;
  teachers: Teacher[];
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [schedule, setSchedule] = useState(initial?.schedule ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [teacherId, setTeacherId] = useState(initial?.teacher?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const url = initial ? `/api/admin/classes/${initial.id}` : "/api/admin/classes";
    const res = await fetch(url, {
      method: initial ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, schedule, description, teacherId: teacherId || null }),
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
    <Modal open={open} onClose={onClose} title={initial ? `Edit ${initial.name}` : "Add a class"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Class name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Schedule" hint="Free text, e.g. Mon/Wed/Fri 6:00 PM">
          <TextInput value={schedule} onChange={(e) => setSchedule(e.target.value)} />
        </Field>
        <Field label="Teacher">
          <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">Unassigned</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description (optional)">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <InlineAlert>{error}</InlineAlert>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Saving…" : initial ? "Save changes" : "Create class"}
        </Button>
      </form>
    </Modal>
  );
}

function RosterModal({
  cls,
  students,
  onClose,
  onSaved,
}: {
  cls: ClassItem;
  students: Student[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(cls.enrollments.map((e) => e.student.id))
  );
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/admin/classes/${cls.id}/enrollments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentIds: Array.from(selected) }),
    });
    setSaving(false);
    onClose();
    onSaved();
  }

  const filtered = students.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal open onClose={onClose} title={`${cls.name} roster`} description={`${selected.size} selected`}>
      <TextInput
        placeholder="Search students…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="field-input mb-3"
      />
      <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-white/5 p-2">
        {filtered.length === 0 && <p className="p-3 text-sm text-slate-500">No students found.</p>}
        {filtered.map((s) => (
          <label
            key={s.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-white/5"
          >
            <input
              type="checkbox"
              checked={selected.has(s.id)}
              onChange={() => toggle(s.id)}
              className="h-4 w-4 rounded accent-aura-blue"
            />
            {s.name}
          </label>
        ))}
      </div>
      <Button className="mt-4 w-full" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save roster"}
      </Button>
    </Modal>
  );
}
