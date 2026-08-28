-- Structured weekday schedule, needed for holiday auto-detection (the
-- existing `schedule` free-text column isn't reliably machine-parseable).
-- Defaults to an empty array so existing classes are simply skipped by
-- detection until an admin sets their days - never guessed at.
ALTER TABLE "Class" ADD COLUMN "scheduleDays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

CREATE TABLE "ClassHoliday" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassHoliday_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassHoliday_classId_date_key" ON "ClassHoliday"("classId", "date");

ALTER TABLE "ClassHoliday" ADD CONSTRAINT "ClassHoliday_classId_fkey"
  FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;
