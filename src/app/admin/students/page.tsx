"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Pencil, Search, Phone, Upload, IdCard } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Field, TextInput } from "@/components/ui/Field";
import { Button, PageHeader, EmptyState, InlineAlert, FadeIn } from "@/components/ui/Common";
import { Badge } from "@/components/ui/Badge";

type ClassRef = { id: string; name: string };
type Student = {
  id: string;
  name: string;
  studentCode: string | null;
  parentPhone: string | null;
  isActive: boolean;
  enrollments: { class: ClassRef }[];
};

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[] | null>(null);
  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

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
    () =>
      (students ?? []).filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          (s.studentCode ?? "").toLowerCase().includes(query.toLowerCase())
      ),
    [students, query]
  );

  return (
    <div>
      <PageHeader
        title="Students"
        description="Add students one at a time, or bulk-upload an entire roster from Excel."
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setBulkOpen(true)}>
              <Upload size={16} /> Bulk upload
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={16} /> Add student
            </Button>
          </div>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <TextInput
          placeholder="Search by name or student ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="field-input pl-9"
        />
      </div>

      {filtered.length === 0 && students !== null && (
        <EmptyState title="No students found" description="Try a different search, or add a new student." />
      )}

      <div className="glass-card overflow-hidden">
        <div className="grid grid-cols-[1.2fr_0.9fr_1fr_0.9fr_1.3fr_auto] gap-3 border-b border-white/5 px-5 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span>Name</span>
          <span>Student ID</span>
          <span>Parent phone</span>
          <span>Status</span>
          <span>Classes</span>
          <span />
        </div>
        {filtered.map((s, i) => (
          <FadeIn
            key={s.id}
            delay={Math.min(i * 0.02, 0.3)}
            className="grid grid-cols-[1.2fr_0.9fr_1fr_0.9fr_1.3fr_auto] items-center gap-3 border-b border-white/5 px-5 py-3 text-sm last:border-0"
          >
            <span className="min-w-0 truncate font-medium text-slate-100">{s.name}</span>
            <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-400">
              {s.studentCode ? (
                <>
                  <IdCard size={13} className="shrink-0" /> <span className="truncate">{s.studentCode}</span>
                </>
              ) : (
                "—"
              )}
            </span>
            <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-400">
              {s.parentPhone ? (
                <>
                  <Phone size={13} className="shrink-0" /> <span className="truncate">{s.parentPhone}</span>
                </>
              ) : (
                "—"
              )}
            </span>
            <StatusBadge student={s} onToggled={load} />
            <span className="flex flex-wrap gap-1">
              {s.enrollments.map((e) => (
                <Badge key={e.class.id} variant="info">
                  {e.class.name}
                </Badge>
              ))}
            </span>
            <span className="flex justify-end gap-1">
              <Button variant="ghost" className="!px-2 !py-1.5 text-xs" onClick={() => setEditing(s)}>
                <Pencil size={13} />
              </Button>
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
      {bulkOpen && <BulkUploadModal onClose={() => setBulkOpen(false)} onSaved={load} />}
    </div>
  );
}

// Click to flip a student between active and inactive - this is now the only
// place that controls the flag (no more separate deactivate button). Inactive
// students already drop out of attendance screens, the roster, and the Excel
// export automatically wherever the app queries `student: { isActive: true }`.
function StatusBadge({ student, onToggled }: { student: Student; onToggled: () => void }) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await fetch(`/api/admin/students/${student.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !student.isActive }),
    });
    setBusy(false);
    onToggled();
  }

  return (
    <button type="button" onClick={toggle} disabled={busy} className="w-fit disabled:opacity-50">
      <Badge variant={student.isActive ? "active" : "neutral"}>{student.isActive ? "Active" : "Inactive"}</Badge>
    </button>
  );
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
  const [studentCode, setStudentCode] = useState(initial?.studentCode ?? "");
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
      body: JSON.stringify({ name, studentCode, parentPhone, classIds: Array.from(selectedClasses) }),
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
        <Field label="Student ID">
          <TextInput value={studentCode} onChange={(e) => setStudentCode(e.target.value)} />
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
        {error && <InlineAlert>{error}</InlineAlert>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Saving…" : initial ? "Save changes" : "Create student"}
        </Button>
      </form>
    </Modal>
  );
}

function BulkUploadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: { row: number; reason: string }[];
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/admin/students/bulk-upload", { method: "POST", body: formData });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok && !json.created) {
      setError(json.error ?? "Upload failed.");
      if (json.errors) setResult(json);
      return;
    }
    setResult(json);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title="Bulk upload students">
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Excel file (.xlsx) with a header row. Columns needed: <strong>Student Name</strong> and{" "}
          <strong>Student ID</strong> — <strong>Parent Phone</strong> is optional. Students already in the system
          (matched by Student ID) are skipped automatically, so it's safe to re-upload the same roster later with a
          few new rows added.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="field-input w-full"
        />
        {error && <InlineAlert>{error}</InlineAlert>}
        {result && (
          <div className="space-y-2 rounded-xl border border-white/10 bg-base-900/60 p-3 text-sm">
            <p className="text-emerald-400">{result.created} student{result.created === 1 ? "" : "s"} added.</p>
            {result.skipped > 0 && (
              <p className="text-slate-400">{result.skipped} skipped — already existed with that Student ID.</p>
            )}
            {result.errors.length > 0 && (
              <div>
                <p className="text-aura-redSoft">
                  {result.errors.length} row{result.errors.length === 1 ? "" : "s"} had a problem:
                </p>
                <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto text-xs text-slate-500">
                  {result.errors.slice(0, 50).map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <Button onClick={handleUpload} disabled={!file || loading} className="w-full">
          {loading ? "Uploading…" : "Upload"}
        </Button>
      </div>
    </Modal>
  );
}
