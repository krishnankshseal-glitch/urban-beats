"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Check, X, Lock, Clock, Phone } from "lucide-react";
import { Button, InlineAlert, EmptyState, FadeIn } from "@/components/ui/Common";
import { Badge, membershipBadgeVariant, membershipBadgeLabel } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type RosterEntry = {
  studentId: string;
  name: string;
  parentPhone: string | null;
  membership: string;
  status: "PRESENT" | "ABSENT" | null;
};

type AttendanceState = {
  date: string;
  roster: RosterEntry[];
  alreadySubmitted: boolean;
  editableUntil: string | null;
  locked: boolean;
};

export default function TakeAttendancePage() {
  const params = useParams<{ classId: string }>();
  const classId = params.classId;

  const [data, setData] = useState<AttendanceState | null>(null);
  const [statuses, setStatuses] = useState<Record<string, "PRESENT" | "ABSENT">>({});
  const [now, setNow] = useState(() => new Date());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  async function load() {
    const res = await fetch(`/api/teacher/attendance?classId=${classId}`);
    const json = await res.json();
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? "Couldn't load this class." });
      return;
    }
    setData(json);
    const initial: Record<string, "PRESENT" | "ABSENT"> = {};
    for (const r of json.roster) if (r.status) initial[r.studentId] = r.status;
    setStatuses(initial);
  }

  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const editableUntilDate = data?.editableUntil ? new Date(data.editableUntil) : null;
  const isLocked = editableUntilDate ? now > editableUntilDate : false;

  const minutesLeft = useMemo(() => {
    if (!editableUntilDate) return null;
    return Math.max(0, Math.round((editableUntilDate.getTime() - now.getTime()) / 60000));
  }, [editableUntilDate, now]);

  const allMarked = data ? data.roster.every((r) => statuses[r.studentId]) : false;

  async function handleSubmit() {
    if (!data) return;
    setSubmitConfirmOpen(false);
    setSaving(true);
    setMessage(null);
    const records = data.roster.map((r) => ({ studentId: r.studentId, status: statuses[r.studentId] }));
    const res = await fetch("/api/teacher/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId, records }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage({ kind: "error", text: json.error ?? "Something went wrong." });
      return;
    }
    setMessage({ kind: "success", text: "Attendance saved and backed up to Drive." });
    load();
  }

  if (!data) {
    return message ? <InlineAlert>{message.text}</InlineAlert> : <p className="text-sm text-slate-500">Loading…</p>;
  }

  if (data.roster.length === 0) {
    return <EmptyState title="No students in this class yet" description="Ask your admin to add students to the roster." />;
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-display text-xs uppercase tracking-[0.3em] text-slate-500">Today</p>
          <h1 className="font-display text-xl font-semibold text-white">
            {new Date(data.date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h1>
        </div>
        {data.alreadySubmitted && (
          <Badge variant={isLocked ? "neutral" : "info"}>
            {isLocked ? (
              <>
                <Lock size={12} className="mr-1 inline" /> Locked — final
              </>
            ) : (
              <>
                <Clock size={12} className="mr-1 inline" /> Editable for {minutesLeft} more min
              </>
            )}
          </Badge>
        )}
      </div>

      {message && <InlineAlert kind={message.kind}>{message.text}</InlineAlert>}

      {isLocked && (
        <InlineAlert kind="success">
          This day's attendance is final — the 30-minute edit window has passed.
        </InlineAlert>
      )}

      <div className="space-y-2">
        {data.roster.map((r, i) => (
          <FadeIn
            key={r.studentId}
            delay={Math.min(i * 0.03, 0.3)}
            className="glass-card flex flex-wrap items-center justify-between gap-3 p-4"
          >
            <div>
              <p className="font-medium text-slate-100">{r.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={membershipBadgeVariant(r.membership)}>{membershipBadgeLabel(r.membership)}</Badge>
                {r.parentPhone && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Phone size={11} /> {r.parentPhone}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                disabled={isLocked}
                onClick={() => setStatuses((s) => ({ ...s, [r.studentId]: "PRESENT" }))}
                className={
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 " +
                  (statuses[r.studentId] === "PRESENT"
                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                    : "border-white/10 text-slate-400 hover:bg-white/5")
                }
              >
                <Check size={14} /> Present
              </button>
              <button
                disabled={isLocked}
                onClick={() => setStatuses((s) => ({ ...s, [r.studentId]: "ABSENT" }))}
                className={
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 " +
                  (statuses[r.studentId] === "ABSENT"
                    ? "border-aura-red/30 bg-aura-red/15 text-aura-redSoft"
                    : "border-white/10 text-slate-400 hover:bg-white/5")
                }
              >
                <X size={14} /> Absent
              </button>
            </div>
          </FadeIn>
        ))}
      </div>

      {!isLocked && (
        <Button onClick={() => setSubmitConfirmOpen(true)} disabled={!allMarked || saving} className="w-full">
          {saving ? "Saving…" : data.alreadySubmitted ? "Update attendance" : "Submit attendance"}
        </Button>
      )}
      {!allMarked && !isLocked && (
        <p className="text-center text-xs text-slate-500">Mark everyone present or absent to submit.</p>
      )}

      <ConfirmDialog
        open={submitConfirmOpen}
        title={data.alreadySubmitted ? "Update attendance?" : "Submit attendance?"}
        description="You'll be able to make changes for 30 minutes after this. After that, it's locked in and synced to Drive."
        confirmLabel={data.alreadySubmitted ? "Update" : "Submit"}
        onConfirm={handleSubmit}
        onCancel={() => setSubmitConfirmOpen(false)}
      />
    </div>
  );
}
