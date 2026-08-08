import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withRole } from "@/lib/apiGuard";
import { writeAuditLog } from "@/lib/audit";
import { renewSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return withRole("ADMIN", async (session) => {
    const parsed = renewSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Pick a start date and a number of months." }, { status: 400 });
    }
    const { startDate, months } = parsed.data;

    const student = await prisma.student.findUnique({ where: { id: params.id } });
    if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

    await prisma.student.update({
      where: { id: params.id },
      data: { membershipStart: new Date(startDate), membershipMonths: months },
    });

    await writeAuditLog({
      userId: session.userId,
      action: "RENEW_MEMBERSHIP",
      entityType: "Student",
      entityId: params.id,
      detail: `Renewed "${student.name}" for ${months} month(s) starting ${startDate}`,
    });

    return NextResponse.json({ ok: true });
  });
}
