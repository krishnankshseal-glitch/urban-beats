import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { parseStudentWorkbook } from "@/lib/studentImport";

export const runtime = "nodejs";

// Inserted in chunks rather than one giant createMany — keeps each query a
// reasonable size and plays nicely with the single pooled DB connection
// (see DATABASE_URL's connection_limit=1) each function instance gets.
const BATCH_SIZE = 500;

export async function POST(req: NextRequest) {
  return withRole("ADMIN", async (session) => {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Attach an Excel file." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { valid, errors } = await parseStudentWorkbook(buffer);

    if (valid.length === 0) {
      return NextResponse.json(
        {
          created: 0,
          skipped: 0,
          errors: errors.length ? errors : [{ row: 0, reason: "No valid rows found in the file." }],
        },
        { status: 400 }
      );
    }

    let created = 0;
    for (let i = 0; i < valid.length; i += BATCH_SIZE) {
      const batch = valid.slice(i, i + BATCH_SIZE);
      const result = await prisma.student.createMany({
        data: batch.map((r) => ({
          name: r.name,
          parentPhone: r.parentPhone,
          studentCode: r.studentCode,
        })),
        // Matches on the unique studentCode - students already in the system
        // (from a previous upload, or added manually) are silently skipped
        // rather than erroring the whole batch, so re-uploading a roster
        // with a few new rows added is safe to do.
        skipDuplicates: true,
      });
      created += result.count;
    }
    const skipped = valid.length - created;

    await writeAuditLog({
      userId: session.userId,
      action: "BULK_UPLOAD_STUDENTS",
      entityType: "Student",
      detail: `Bulk uploaded ${created} student(s) from Excel (${skipped} skipped as duplicate IDs, ${errors.length} row(s) had errors)`,
    });

    return NextResponse.json({ created, skipped, errors });
  });
}
