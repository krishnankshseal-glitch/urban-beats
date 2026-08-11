import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOverdueStudents, getAbsenceStreaks } from "@/lib/dashboard";
import { SessionsPanel } from "@/components/SessionsPanel";
import { FadeIn } from "@/components/ui/Common";
import { Badge } from "@/components/ui/Badge";
import { Users, GraduationCap, CalendarCheck2, AlertTriangle, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await getSession();

  const [teacherCount, studentCount, classCount, overdue, streaks] = await Promise.all([
    prisma.teacher.count({ where: { isActive: true } }),
    prisma.student.count({ where: { isActive: true } }),
    prisma.class.count({ where: { isActive: true } }),
    getOverdueStudents(),
    getAbsenceStreaks(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-xs uppercase tracking-[0.3em] text-slate-500">Welcome back</p>
        <h1 className="font-display text-2xl font-semibold text-white">{session?.username}</h1>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <FadeIn className="glass-card p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">Teachers</p>
            <GraduationCap size={16} className="text-aura-blueSoft" />
          </div>
          <p className="font-mono-data mt-2 text-2xl text-white sm:text-3xl">{teacherCount}</p>
        </FadeIn>
        <FadeIn delay={0.05} className="glass-card p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">Students</p>
            <Users size={16} className="text-aura-blueSoft" />
          </div>
          <p className="font-mono-data mt-2 text-2xl text-white sm:text-3xl">{studentCount}</p>
        </FadeIn>
        <FadeIn delay={0.1} className="glass-card p-3 sm:p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 sm:text-xs">Classes</p>
            <CalendarCheck2 size={16} className="text-aura-blueSoft" />
          </div>
          <p className="font-mono-data mt-2 text-2xl text-white sm:text-3xl">{classCount}</p>
        </FadeIn>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FadeIn delay={0.1} className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-aura-redSoft" />
            <p className="text-sm font-medium text-slate-200">Fees overdue</p>
          </div>
          {overdue.length === 0 && <p className="text-sm text-slate-500">No overdue memberships. Nice.</p>}
          <div className="space-y-2">
            {overdue.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-slate-200">{s.name}</span>
                <Badge variant="overdue">{s.daysOverdue} day{s.daysOverdue === 1 ? "" : "s"} overdue</Badge>
              </div>
            ))}
          </div>
        </FadeIn>

        <FadeIn delay={0.15} className="glass-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock size={16} className="text-amber-400" />
            <p className="text-sm font-medium text-slate-200">Not attended recently</p>
          </div>
          {streaks.length === 0 && <p className="text-sm text-slate-500">No one's on a long absence streak.</p>}
          <div className="space-y-2">
            {streaks.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 px-3 py-2 text-sm">
                <span className="min-w-0 truncate text-slate-200">{s.name}</span>
                <Badge variant="dueSoon">{s.streak} classes missed in a row</Badge>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>

      <SessionsPanel />
    </div>
  );
}
