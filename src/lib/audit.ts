import { getDb } from "./db";

export async function writeAuditLog(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string;
  detail?: string;
}) {
  const prisma = getDb();
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        detail: params.detail,
      },
    });
  } catch {
    // Audit logging should never break the actual operation it's logging.
  }
}
