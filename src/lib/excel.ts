import ExcelJS from "exceljs";
import { getDaysInMonth } from "date-fns";

export type RosterStudent = {
  id: string;
  name: string;
  membershipLabel: string;
};

export type AttendanceCell = "PRESENT" | "ABSENT";

export async function buildAttendanceWorkbook(params: {
  year: number;
  month: number; // 1-12
  students: RosterStudent[];
  attendance: Record<string, Record<number, AttendanceCell>>; // studentId -> day -> status
}): Promise<Buffer> {
  const { year, month, students, attendance } = params;
  const daysInMonth = getDaysInMonth(new Date(year, month - 1, 1));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Urban Beats Attendance";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`${year}-${String(month).padStart(2, "0")}`, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 1 }],
  });

  const headerRow = ["Student Name", "Membership Status"];
  for (let d = 1; d <= daysInMonth; d++) headerRow.push(String(d));
  const header = sheet.addRow(headerRow);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12151D" } };
  header.alignment = { horizontal: "center", vertical: "middle" };

  sheet.getColumn(1).width = 26;
  sheet.getColumn(2).width = 18;
  for (let d = 1; d <= daysInMonth; d++) sheet.getColumn(2 + d).width = 5;

  for (const student of students) {
    const row: (string | number)[] = [student.name, student.membershipLabel];
    for (let d = 1; d <= daysInMonth; d++) {
      const status = attendance[student.id]?.[d];
      row.push(status === "PRESENT" ? "P" : status === "ABSENT" ? "A" : "");
    }
    const addedRow = sheet.addRow(row);
    addedRow.alignment = { horizontal: "center", vertical: "middle" };
    addedRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    addedRow.getCell(2).alignment = { horizontal: "left", vertical: "middle" };

    for (let d = 1; d <= daysInMonth; d++) {
      const cell = addedRow.getCell(2 + d);
      const status = attendance[student.id]?.[d];
      if (status === "PRESENT") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A2F" } };
        cell.font = { color: { argb: "FF4ADE80" } };
      } else if (status === "ABSENT") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3A1E24" } };
        cell.font = { color: { argb: "FFFF6B85" } };
      }
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function sheetFilename(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")} Attendance.xlsx`;
}
