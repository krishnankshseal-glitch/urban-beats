import { addMonths, differenceInCalendarDays } from "date-fns";

export type MembershipStatus = "ACTIVE" | "DUE_SOON" | "OVERDUE" | "NOT_SET";

export function getMembershipInfo(student: {
  membershipStart: Date | null;
  membershipMonths: number | null;
}): {
  status: MembershipStatus;
  expiryDate: Date | null;
  daysUntilExpiry: number | null;
  daysOverdue: number | null;
} {
  if (!student.membershipStart || !student.membershipMonths) {
    return { status: "NOT_SET", expiryDate: null, daysUntilExpiry: null, daysOverdue: null };
  }

  const expiryDate = addMonths(student.membershipStart, student.membershipMonths);
  const daysUntilExpiry = differenceInCalendarDays(expiryDate, new Date());

  if (daysUntilExpiry < 0) {
    return { status: "OVERDUE", expiryDate, daysUntilExpiry, daysOverdue: -daysUntilExpiry };
  }
  if (daysUntilExpiry <= 7) {
    return { status: "DUE_SOON", expiryDate, daysUntilExpiry, daysOverdue: null };
  }
  return { status: "ACTIVE", expiryDate, daysUntilExpiry, daysOverdue: null };
}
