import { prisma } from "./db";
import { buildAttendanceWorkbook, sheetFilename } from "./excel";
import { raceWithBudget } from "./timeBudget";
import {
  getOrCreateClassFolder,
  getOrCreateYearFolder,
  uploadOrReplaceSheet,
  updateSheetInPlace,
  isDriveConfigured,
  handleDriveAuthFailure,
} from "./googleDrive";

export async function buildWorkbookBufferForClassMonth(classId: string, year: number, month: number) {
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
  }));

  return buildAttendanceWorkbook({ year, month, students: roster, attendance: attendanceMap });
}

const NOT_CONNECTED = "Google Drive isn't connected yet — set it up from Settings.";

export type SyncOutcome = { ok: boolean; error?: string };

/**
 * Rebuilds the month's Excel sheet from the database and writes it to Drive.
 * Never throws: failures are recorded on the sheet's metadata (and returned),
 * so a Drive problem can never break saving attendance.
 */
export async function syncAttendanceSheet(classId: string, year: number, month: number): Promise<SyncOutcome> {
  const cls = await prisma.class.findUnique({ where: { id: classId } });
  if (!cls) return { ok: true };

  const where = { classId_year_month: { classId, year, month } };
  const existingMeta = await prisma.sheetMetadata.findUnique({ where });

  // A month the purge has archived is permanent: its rows are gone from the
  // database, so rebuilding the sheet now would overwrite the complete Drive
  // backup with an almost empty one.
  if (existingMeta?.status === "closed") return { ok: true };

  if (!(await isDriveConfigured())) {
    await prisma.sheetMetadata.upsert({
      where,
      update: { syncError: NOT_CONNECTED },
      create: { classId, year, month, syncError: NOT_CONNECTED },
    });
    return { ok: false, error: NOT_CONNECTED };
  }

  // "Backed up as of" is the moment we READ the data, minus a small safety
  // margin for clock differences between servers - not the moment the upload
  // finished. Otherwise an edit made while this sync was running would look
  // backed up when the file doesn't contain it, and the purge could delete it.
  const dataReadAt = new Date(Date.now() - 2000);

  try {
    const buffer = await buildWorkbookBufferForClassMonth(classId, year, month);

    // Common case: the sheet already exists, so one Drive call updates it.
    let uploaded = existingMeta?.driveFileId ? await updateSheetInPlace(existingMeta.driveFileId, buffer) : null;

    if (!uploaded) {
      // First sync of this month, or the remembered file can't be reached any
      // more: resolve (and if needed repair) the folders and write a fresh copy.
      const classFolderId = await getOrCreateClassFolder(classId, cls.name);
      if (!classFolderId) throw new Error("Couldn't resolve a Drive folder for this class.");

      const yearFolderId = await getOrCreateYearFolder(classFolderId, year);
      if (!yearFolderId) throw new Error("Couldn't resolve a Drive year folder for this class.");

      uploaded = await uploadOrReplaceSheet({
        folderId: yearFolderId,
        filename: sheetFilename(year, month),
        buffer,
        existingFileId: null,
      });
    }

    await prisma.sheetMetadata.upsert({
      where,
      update: {
        driveFileId: uploaded.fileId,
        driveWebViewLink: uploaded.webViewLink,
        lastSyncedAt: dataReadAt,
        syncError: null,
      },
      create: {
        classId,
        year,
        month,
        driveFileId: uploaded.fileId,
        driveWebViewLink: uploaded.webViewLink,
        lastSyncedAt: dataReadAt,
      },
    });
    return { ok: true };
  } catch (err) {
    const expired = await handleDriveAuthFailure(err);
    const message = expired
      ? "Your Google Drive connection expired — reconnect it from Settings."
      : err instanceof Error
      ? err.message
      : "Unknown Drive sync error";
    await prisma.sheetMetadata.upsert({
      where,
      update: { syncError: message },
      create: { classId, year, month, syncError: message },
    });
    return { ok: false, error: message };
  }
}

/**
 * Same as syncAttendanceSheet, but gives up waiting after `budgetMs` so a slow
 * Google call can't push a request past the serverless time limit. If it times
 * out the sync may still finish; if not, the scheduled reconcile job retries it.
 */
export async function syncAttendanceSheetWithin(
  classId: string,
  year: number,
  month: number,
  budgetMs = 8000
): Promise<SyncOutcome & { timedOut?: boolean }> {
  return raceWithBudget<SyncOutcome & { timedOut?: boolean }>(
    syncAttendanceSheet(classId, year, month).catch((err) => ({
      ok: false,
      error: err instanceof Error ? err.message : "Unknown Drive sync error",
    })),
    budgetMs,
    () => ({ ok: false, timedOut: true, error: "The Drive backup is taking longer than usual and will finish on its own." })
  );
}
