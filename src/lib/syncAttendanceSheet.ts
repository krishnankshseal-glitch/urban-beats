import { getDb } from "./db";
import { buildAttendanceWorkbook, sheetFilename } from "./excel";
import { getOrCreateClassFolder, getOrCreateYearFolder, uploadOrReplaceSheet, isDriveConfigured } from "./googleDrive";
import { getMembershipInfo, MembershipStatus } from "./membership";

const STATUS_LABEL: Record<MembershipStatus, string> = {
  ACTIVE: "Active",
  DUE_SOON: "Due soon",
  OVERDUE: "Overdue",
  NOT_SET: "Not set",
};

export async function buildWorkbookBufferForClassMonth(classId: string, year: number, month: number) {
  const prisma = getDb();
  const enrollments = await prisma.enrollment.findMany({
    where: { classId, student: { isActive: true } },
    include: { student: true },
    orderBy: { student: { name: "asc" } },
  });
  const students = enrollments.map((e) => e.student);

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));

  const attendanceRows = await prisma.attendance.findMany({
    where: { classId, date: { gte: startOfMonth, lt: startOfNextMonth } },
  });

  const attendanceMap: Record<string, Record<number, "PRESENT" | "ABSENT">> = {};
  for (const row of attendanceRows) {
    const day = row.date.getUTCDate();
    attendanceMap[row.studentId] = attendanceMap[row.studentId] ?? {};
    attendanceMap[row.studentId][day] = row.status;
  }

  const roster = students.map((s) => ({
    id: s.id,
    name: s.name,
    membershipLabel: STATUS_LABEL[getMembershipInfo(s).status],
  }));

  return buildAttendanceWorkbook({ year, month, students: roster, attendance: attendanceMap });
}

export async function syncAttendanceSheet(classId: string, year: number, month: number) {
  const prisma = getDb();
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) return;

  const where = { classId_year_month: { classId, year, month } };
  const existingMeta = await prisma.sheetMetadata.findUnique({ where });

  if (!(await isDriveConfigured())) {
    await prisma.sheetMetadata.upsert({
      where,
      update: { syncError: "Google Drive isn't connected yet — set it up from Settings." },
      create: {
        classId,
        year,
        month,
        syncError: "Google Drive isn't connected yet — set it up from Settings.",
      },
    });
    return;
  }

  try {
    const buffer = await buildWorkbookBufferForClassMonth(classId, year, month);
    const classFolderId = await getOrCreateClassFolder(classId, cls.name);
    if (!classFolderId) throw new Error("Couldn't resolve a Drive folder for this class.");

    const yearFolderId = await getOrCreateYearFolder(classFolderId, year);
    if (!yearFolderId) throw new Error("Couldn't resolve a Drive year folder for this class.");

    const uploaded = await uploadOrReplaceSheet({
      folderId: yearFolderId,
      filename: sheetFilename(year, month),
      buffer,
      existingFileId: existingMeta?.driveFileId ?? null,
    });

    await prisma.sheetMetadata.upsert({
      where,
      update: {
        driveFileId: uploaded.fileId,
        driveWebViewLink: uploaded.webViewLink,
        lastSyncedAt: new Date(),
        syncError: null,
      },
      create: {
        classId,
        year,
        month,
        driveFileId: uploaded.fileId,
        driveWebViewLink: uploaded.webViewLink,
        lastSyncedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Drive sync error";
    await prisma.sheetMetadata.upsert({
      where,
      update: { syncError: message },
      create: { classId, year, month, syncError: message },
    });
  }
}
