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
  /** Non-blank data rows looked at (valid + rejected). */
  totalRows: number;
};

/** The upload isn't a readable .xlsx workbook (wrong format, corrupt, password-protected...). */
export class UnreadableWorkbookError extends Error {
  constructor(message = "Couldn't read that file. Please upload an Excel .xlsx file (not .xls or .csv).") {
    super(message);
    this.name = "UnreadableWorkbookError";
  }
}

export const MAX_ROWS = 5000;
const MAX_NAME = 120;
const MAX_CODE = 64;
const MAX_PHONE = 30;
/** People often put a title above the headers - look this far down for them. */
const HEADER_SCAN_ROWS = 10;

// Headers are compared lower-cased with everything but letters and digits
// removed, so "Parent's Phone Number", "parent_phone" and "PARENT PHONE" all match.
const NAME_HEADERS = ["studentname", "name", "fullname"];
const CODE_HEADERS = ["studentid", "id", "studentcode", "code", "rollno", "rollnumber"];
const PHONE_HEADERS = [
  "parentphone", "parentphonenumber", "parentsphone", "parentsphonenumber", "parentcontact",
  "phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactnumber",
];

function normalizeHeader(v: unknown): string {
  return cellText(v).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Plain text of any Excel cell: strings, numbers, dates, rich text, formulas, hyperlinks. */
function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as any;
    if (Array.isArray(o.richText)) return o.richText.map((part: any) => part?.text ?? "").join("").trim();
    if (o.result != null) return cellText(o.result); // formula cell: use its computed value
    if (typeof o.text === "string") return o.text.trim(); // hyperlink
    if (o.text && typeof o.text === "object") return cellText(o.text); // hyperlink with rich text
    if (typeof o.error === "string") return ""; // #N/A and friends
  }
  return String(v).trim();
}

function findHeader(sheet: ExcelJS.Worksheet) {
  const last = Math.min(sheet.rowCount, HEADER_SCAN_ROWS);
  for (let r = 1; r <= last; r++) {
    let nameCol = 0;
    let phoneCol = 0;
    let codeCol = 0;
    sheet.getRow(r).eachCell((cell, colNumber) => {
      const h = normalizeHeader(cell.value);
      if (NAME_HEADERS.includes(h)) nameCol = colNumber;
      else if (PHONE_HEADERS.includes(h)) phoneCol = colNumber;
      else if (CODE_HEADERS.includes(h)) codeCol = colNumber;
    });
    if (nameCol && codeCol) return { row: r, nameCol, phoneCol, codeCol };
  }
  return null;
}

/**
 * Parses an uploaded roster (first worksheet). The header row can be anywhere
 * in the first 10 rows; column order doesn't matter. Needs a name column
 * ("Student Name"/"Name") and an ID column ("Student ID"/"ID"/"Roll No");
 * a parent phone column is optional. Bad rows are reported, never fatal to
 * the rest of the file.
 */
export async function parseStudentWorkbook(buffer: Buffer): Promise<ParseResult> {
  // .xlsx files are zip archives, which always start with "PK".
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) throw new UnreadableWorkbookError();

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    throw new UnreadableWorkbookError();
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return { valid: [], errors: [{ row: 0, reason: "The file has no worksheets." }], totalRows: 0 };

  const header = findHeader(sheet);
  if (!header) {
    return {
      valid: [],
      errors: [
        {
          row: 1,
          reason:
            'Couldn\'t find the required columns in the first 10 rows. The header row needs "Student Name" and "Student ID" (parent phone is optional).',
        },
      ],
      totalRows: 0,
    };
  }
  if (sheet.rowCount - header.row > MAX_ROWS) {
    return {
      valid: [],
      errors: [{ row: 0, reason: `Too many rows - the limit is ${MAX_ROWS} per upload. Split the file and upload it in parts.` }],
      totalRows: 0,
    };
  }

  const valid: ParsedStudentRow[] = [];
  const errors: { row: number; reason: string }[] = [];
  const seenCodes = new Set<string>();
  let totalRows = 0;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= header.row) return;

    const name = cellText(row.getCell(header.nameCol).value);
    const phone = header.phoneCol ? cellText(row.getCell(header.phoneCol).value) : "";
    const code = cellText(row.getCell(header.codeCol).value);

    if (!name && !code && !phone) return; // fully blank row - skip silently, not an error
    totalRows++;

    if (!name) return void errors.push({ row: rowNumber, reason: "Missing student name." });
    if (!code) return void errors.push({ row: rowNumber, reason: "Missing student ID." });
    if (name.length > MAX_NAME) return void errors.push({ row: rowNumber, reason: `Name is longer than ${MAX_NAME} characters.` });
    if (code.length > MAX_CODE) return void errors.push({ row: rowNumber, reason: `Student ID is longer than ${MAX_CODE} characters.` });
    if (phone.length > MAX_PHONE) return void errors.push({ row: rowNumber, reason: `Phone number is longer than ${MAX_PHONE} characters.` });
    if (seenCodes.has(code)) {
      return void errors.push({ row: rowNumber, reason: `Duplicate student ID "${code}" within this file.` });
    }
    seenCodes.add(code);

    valid.push({ row: rowNumber, name, parentPhone: phone || null, studentCode: code });
  });

  return { valid, errors, totalRows };
}
