"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import { Select } from "@/components/ui/Field";
import { Button, PageHeader, InlineAlert, EmptyState } from "@/components/ui/Common";
import { Badge, membershipBadgeVariant, membershipBadgeLabel } from "@/components/ui/Badge";

type ClassRef = { id: string; name: string };
type GridStudent = { id: string; name: string; membership: string };
type GridData = {
  class: ClassRef;
  students: GridStudent[];
  attendance: Record<string, Record<number, "PRESENT" | "ABSENT">>;
  sheet: { driveWebViewLink: string | null; lastSyncedAt: string | null; syncError: string | null } | null;
};

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export default function AttendanceGridPage() {
  const [classes, setClasses] = useState<ClassRef[]>([]);
  const [classId, setClassId] = useState("");
  const [monthValue, setMonthValue] = useState(() => new Date().toISOString().slice(0, 7));
  const [grid, setGrid] = useState<GridData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  const [year, month] = monthValue.split("-").map(Number);
  const totalDays = useMemo(() => daysInMonth(year, month), [year, month]);

  useEffect(() => {
    fetch("/api/admin/classes")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.classes ?? []).map((c: any) => ({ id: c.id, name: c.name }));
        setClasses(list);
        if (list.length > 0) setClassId((prev) => prev || list[0].id);
      });
  }, []);

  async function loadGrid() {
    if (!classId) return;
    setLoading(true);
    const res = await fetch(`/api/admin/attendance?classId=${classId}&year=${year}&month=${month}`);
    const data = await res.json();
    setGrid(res.ok ? data : null);
    setLoading(false);
  }

  useEffect(() => {
    loadGrid();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, monthValue]);

  async function cycleCell(studentId: string, day: number) {
    if (!grid) return;
    const current = grid.attendance[studentId]?.[day];
    const next = current === undefined ? "PRESENT" : current === "PRESENT" ? "ABSENT" : "CLEAR";
    const cellKey = `${studentId}-${day}`;
    setSaving(cellKey);

    setGrid((prev) => {
      if (!prev) return prev;
      const attendance = { ...prev.attendance };
      attendance[studentId] = { ...attendance[studentId] };
      if (next === "CLEAR") delete attendance[studentId][day];
      else attendance[studentId][day] = next;
      return { ...prev, attendance };
    });

    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    await fetch("/api/admin/attendance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId, studentId, date: dateStr, status: next }),
    });
    setSaving(null);
    loadGrid();
  }

  function download() {
    window.open(`/api/admin/attendance/download?classId=${classId}&year=${year}&month=${month}`, "_blank");
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Click any cell to cycle Present → Absent → blank. Every change re-syncs to Drive instantly."
        action={
          <Button variant="secondary" onClick={download} disabled={!classId}>
            <Download size={16} /> Download .xlsx
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap gap-3">
        <Select value={classId} onChange={(e) => setClassId(e.target.value)} className="max-w-xs">
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <input
          type="month"
          value={monthValue}
          onChange={(e) => setMonthValue(e.target.value)}
          className="field-input w-auto"
        />
      </div>

      {classes.length === 0 && (
        <EmptyState title="No classes yet" description="Add a class first from the Classes page." />
      )}

      {grid?.sheet?.syncError && (
        <div className="mb-4">
          <InlineAlert>Drive sync issue: {grid.sheet.syncError}</InlineAlert>
        </div>
      )}

      {grid?.sheet?.driveWebViewLink && (
        <a
          href={grid.sheet.driveWebViewLink}
          target="_blank"
          rel="noreferrer"
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-aura-blueSoft hover:underline"
        >
          <ExternalLink size={13} /> View this month's sheet in Drive
        </a>
      )}

      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {grid && grid.students.length === 0 && (
        <EmptyState title="No students in this class" description="Add students to the roster from the Classes page." />
      )}

      {grid && grid.students.length > 0 && (
        <div className="glass-card overflow-x-auto p-0">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-10 bg-base-800/95 px-4 py-3 text-left backdrop-blur">Student</th>
                <th className="px-3 py-3 text-left">Membership</th>
                {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                  <th key={d} className="w-9 px-1 py-3 text-center font-normal">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.students.map((s) => (
                <tr key={s.id} className="border-b border-white/5 last:border-0">
                  <td className="sticky left-0 z-10 bg-base-800/95 px-4 py-2 font-medium text-slate-200 backdrop-blur">
                    {s.name}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={membershipBadgeVariant(s.membership)}>
                      {membershipBadgeLabel(s.membership)}
                    </Badge>
                  </td>
                  {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => {
                    const status = grid.attendance[s.id]?.[d];
                    const key = `${s.id}-${d}`;
                    return (
                      <td key={d} className="p-0.5 text-center">
                        <button
                          onClick={() => cycleCell(s.id, d)}
                          disabled={saving === key}
                          className={
                            "h-7 w-7 rounded-md text-xs font-semibold transition " +
                            (status === "PRESENT"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : status === "ABSENT"
                              ? "bg-aura-red/20 text-aura-redSoft"
                              : "bg-white/5 text-transparent hover:bg-white/10")
                          }
                        >
                          {status === "PRESENT" ? "P" : status === "ABSENT" ? "A" : "·"}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
