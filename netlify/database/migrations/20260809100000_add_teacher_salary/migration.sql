-- Add monthlySalary to Teacher (admin-only field; never exposed on teacher-facing routes)
ALTER TABLE "Teacher" ADD COLUMN "monthlySalary" INTEGER;
