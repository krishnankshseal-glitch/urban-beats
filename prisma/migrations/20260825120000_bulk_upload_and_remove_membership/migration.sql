-- Remove membership tracking (replaced by a plain isActive flag the admin
-- sets directly — no more derived ACTIVE/DUE_SOON/OVERDUE status or expiry math)
ALTER TABLE "Student" DROP COLUMN "membershipStart";
ALTER TABLE "Student" DROP COLUMN "membershipMonths";
DROP TYPE "MembershipStatus";

-- Add a human-assigned student ID for bulk Excel import/re-import.
-- Nullable so existing students without one don't violate the unique index.
ALTER TABLE "Student" ADD COLUMN "studentCode" TEXT;
CREATE UNIQUE INDEX "Student_studentCode_key" ON "Student"("studentCode");
