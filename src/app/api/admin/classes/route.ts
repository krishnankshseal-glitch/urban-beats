import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { classCreateSchema } from "@/lib/schemas";
import { getOrCreateClassFolder, getOrCreateYearFolder } from "@/lib/googleDrive";

export const runtime = "nodejs";

export async function GET() {
  const prisma = getDb();
  return withRole("ADMIN", async () => {
    const classes = await prisma.class.findMany({
      include: {
        teacher: { select: { id: true, name: true } },
        enrollments: { include: { student: { select: { id: true, name: true, isActive: true } } } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ classes });
  });
}

export async function POST(req: NextRequest) {
  const prisma = getDb();
  return withRole("ADMIN", async (session) => {
    const parsed = classCreateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Please check the form fields." }, { status: 400 });
    }
    const { name, schedule, description, teacherId } = parsed.data;

    const cls = await prisma.class.create({
      data: {
        name,
        schedule: schedule || null,
        description: description || null,
        teacherId: teacherId || null,
      },
    });

    // Best-effort: get the Drive folder structure ready immediately, so it's
    // waiting there before the first attendance is ever submitted. If Drive
    // isn't connected yet (the common case until Settings is configured) or
    // this call fails for any reason, class creation must still succeed —
    // the folder gets created lazily on first sync either way, as a fallback.
    try {
      const folderId = await getOrCreateClassFolder(cls.id, cls.name);
      if (folderId) {
        await getOrCreateYearFolder(folderId, new Date().getFullYear());
      }
    } catch (err) {
      console.error("Drive folder pre-creation failed (non-fatal):", err);
    }

    await writeAuditLog({
      userId: session.userId,
      action: "CREATE_CLASS",
      entityType: "Class",
      entityId: cls.id,
      detail: `Created class "${name}"`,
    });

    return NextResponse.json({ class: cls }, { status: 201 });
  });
}
