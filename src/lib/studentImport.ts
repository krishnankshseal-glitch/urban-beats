import ExcelJS from "exceljs";

export type ParsedStudentRow = {
  row: number; // 1-based spreadsheet row number, for error reporting back to the admin
  name: string;
  parentPhone: string | null;
  studentCode: string;
};

export type ParseResult = {
  valid: ParsedStudentRow[];
  errors: { row: number; reason: string }[];
};

function normalizeHeader(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "");
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const anyV = v as any;
    if (typeof anyV.text === "string") return anyV.text.trim(); // hyperlink / rich text
    if (anyV.result != null) return String(anyV.result).trim(); // formula cell
    if (anyV instanceof Date) return anyV.toISOString();
  }
  return String(v).trim();
}

const NAME_HEADERS = ["studentname", "name"];
const PHONE_HEADERS = ["parentphone", "parentphonenumber", "parentsphonenumber", "phone", "phonenumber"];
const CODE_HEADERS = ["studentid", "id", "studentcode", "code"];

/**
 * Parses an uploaded roster workbook (first worksheet, header row on row 1).
 * Header matching is case/spacing-insensitive and order doesn't matter:
 *   - Name column: "Student Name" or "Name"
 *   - Student ID column: "Student ID", "ID", or "Student Code"
 *   - Parent phone column (optional): "Parent Phone", "Parent's Phone Number", "Phone"
 */
export async function parseStudentWorkbook(buffer: Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { valid: [], errors: [{ row: 0, reason: "The file has no worksheets." }] };
  }

  const headerRow = sheet.getRow(1);
  let nameCol = 0;
  let phoneCol = 0;
  let codeCol = 0;
  headerRow.eachCell((cell, colNumber) => {
    const h = normalizeHeader(cell.value);
    if (NAME_HEADERS.includes(h)) nameCol = colNumber;
    else if (PHONE_HEADERS.includes(h)) phoneCol = colNumber;
    else if (CODE_HEADERS.includes(h)) codeCol = colNumber;
  });

  if (!nameCol || !codeCol) {
    return {
      valid: [],
      errors: [
        {
          row: 1,
          reason:
            'Couldn\'t find the required columns. The header row needs "Student Name" and "Student ID" (parent phone is optional).',
        },
      ],
    };
  }

  const valid: ParsedStudentRow[] = [];
  const errors: { row: number; reason: string }[] = [];
  const seenCodes = new Set<string>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const name = cellText(row.getCell(nameCol).value);
    const phone = phoneCol ? cellText(row.getCell(phoneCol).value) : "";
    const code = cellText(row.getCell(codeCol).value);

    if (!name && !code && !phone) return; // fully blank row — skip silently, not an error

    if (!name) {
      errors.push({ row: rowNumber, reason: "Missing student name." });
      return;
    }
    if (!code) {
      errors.push({ row: rowNumber, reason: "Missing student ID." });
      return;
    }
    if (seenCodes.has(code)) {
      errors.push({ row: rowNumber, reason: `Duplicate student ID "${code}" within this file.` });
      return;
    }
    seenCodes.add(code);

    valid.push({ row: rowNumber, name, parentPhone: phone || null, studentCode: code });
  });

  return { valid, errors };
}
