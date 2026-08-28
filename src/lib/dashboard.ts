import { prisma } from "./db";

export async function getInactiveStudents(limit = 8) {
  return prisma.student.findMany({
    where: { isActive: false },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
    take: limit,
  });
}

export async function getAbsenceStreaks(limit = 8) {
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
