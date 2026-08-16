import { getDb } from "./db";
import { getMembershipInfo } from "./membership";

export async function getOverdueStudents(limit = 8) {
  const prisma = getDb();
  const students = await prisma.student.findMany({ where: { isActive: true } });
  return students
    .map((s) => ({ student: s, info: getMembershipInfo(s) }))
    .filter((x) => x.info.status === "OVERDUE")
    .sort((a, b) => (b.info.daysOverdue ?? 0) - (a.info.daysOverdue ?? 0))
    .slice(0, limit)
    .map((x) => ({ id: x.student.id, name: x.student.name, daysOverdue: x.info.daysOverdue ?? 0 }));
}

export async function getAbsenceStreaks(limit = 8) {
  const prisma = getDb();
  const students = await prisma.student.findMany({
    where: { isActive: true, enrollments: { some: {} } },
    select: { id: true, name: true },
  });

  const allAttendance = await prisma.attendance.findMany({
    where: { studentId: { in: students.map((s) => s.id) } },
    orderBy: { date: "desc" },
    select: { studentId: true, status: true },
  });

  const byStudent = new Map<string, ("PRESENT" | "ABSENT")[]>();
  for (const row of allAttendance) {
    if (!byStudent.has(row.studentId)) byStudent.set(row.studentId, []);
    byStudent.get(row.studentId)!.push(row.status);
  }

  const streaks = students.map((s) => {
    const history = byStudent.get(s.id) ?? [];
    let streak = 0;
    for (const status of history) {
      if (status === "ABSENT") streak++;
      else break;
    }
    return { id: s.id, name: s.name, streak };
  });

  return streaks
    .filter((x) => x.streak >= 3)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, limit);
}
