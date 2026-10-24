import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseStudentWorkbook, UnreadableWorkbookError } from "../src/lib/studentImport";

async function workbook(build: (ws: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Students");
  build(ws);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("parses the standard layout", async () => {
  const buf = await workbook((ws) => {
    ws.addRow(["Student Name", "Student ID", "Parent Phone"]);
    ws.addRow(["Asha Rao", "S-001", "9876543210"]);
    ws.addRow(["Ben Das", "S-002", ""]);
  });
  const r = await parseStudentWorkbook(buf);
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid.length, 2);
  assert.deepEqual(r.valid[0], { row: 2, name: "Asha Rao", parentPhone: "9876543210", studentCode: "S-001" });
  assert.equal(r.valid[1].parentPhone, null);
  assert.equal(r.totalRows, 2);
});

test("accepts header aliases in any order, spelling and case", async () => {
  const buf = await workbook((ws) => {
    ws.addRow(["parent's phone number", "ROLL NO.", "Full_Name"]);
    ws.addRow(["9000000001", "101", "Chitra"]);
  });
  const r = await parseStudentWorkbook(buf);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.valid[0], { row: 2, name: "Chitra", parentPhone: "9000000001", studentCode: "101" });
});

test("finds the header row even with a title above it", async () => {
  const buf = await workbook((ws) => {
    ws.addRow(["Urban Beats - Student Roster 2026"]);
    ws.addRow([]);
    ws.addRow(["Student Name", "Student ID"]);
    ws.addRow(["Dev", "D1"]);
  });
  const r = await parseStudentWorkbook(buf);
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid.length, 1);
  assert.equal(r.valid[0].row, 4);
});

test("works without a phone column", async () => {
  const buf = await workbook((ws) => {
    ws.addRow(["Name", "ID"]);
    ws.addRow(["Esha", "E1"]);
  });
  const r = await parseStudentWorkbook(buf);
  assert.equal(r.valid[0].parentPhone, null);
});

test("numeric IDs and phone numbers become clean text", async () => {
  const buf = await workbook((ws) => {
    ws.addRow(["Student Name", "Student ID", "Parent Phone"]);
    ws.addRow(["Farah", 1001, 9876543210]);
  });
  const r = await parseStudentWorkbook(buf);
  assert.equal(r.valid[0].studentCode, "1001");
  assert.equal(r.valid[0].parentPhone, "9876543210");
});

test("reads rich-text, formula and hyperlink cells instead of '[object Object]'", async () => {
  const buf = await workbook((ws) => {
    ws.addRow(["Student Name", "Student ID", "Parent Phone"]);
    ws.addRow(["x", "x", "x"]);
    ws.getCell("A2").value = { richText: [{ text: "Gita " }, { text: "Nair", font: { bold: true } }] };
    ws.getCell("B2").value = { formula: '"G"&"-7"', result: "G-7" };
    ws.getCell("C2").value = { text: "9111111111", hyperlink: "tel:9111111111" };
  });
  const r = await parseStudentWorkbook(buf);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.valid[0], { row: 2, name: "Gita Nair", parentPhone: "9111111111", studentCode: "G-7" });
});

test("trims whitespace and skips fully blank rows without calling them errors", async () => {
  const buf = await workbook((ws) => {
    ws.addRow(["Student Name", "Student ID", "Parent Phone"]);
    ws.addRow(["  Hari  ", "  H1 ", " 9222222222 "]);
    ws.addRow(["", "", ""]);
    ws.addRow(["Indu", "I1", ""]);
  });
  const r = await parseStudentWorkbook(buf);
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid.length, 2);
  assert.deepEqual(r.valid[0], { row: 2, name: "Hari", parentPhone: "9222222222", studentCode: "H1" });
  assert.equal(r.totalRows, 2);
});

test("reports bad rows with their spreadsheet row numbers and keeps the good ones", async () => {
  const buf = await workbook((ws) => {
    ws.addRow(["Student Name", "Student ID", "Parent Phone"]);
    ws.addRow(["Jai", "J1", ""]); // row 2 ok
    ws.addRow(["", "J2", ""]); // row 3 no name
    ws.addRow(["Kiran", "", ""]); // row 4 no id
    ws.addRow(["Lata", "J1", ""]); // row 5 duplicate of row 2
    ws.addRow(["Mira", "M1", ""]); // row 6 ok
  });
  const r = await parseStudentWorkbook(buf);
  assert.deepEqual(r.valid.map((v) => v.row), [2, 6]);
  assert.deepEqual(r.errors.map((e) => e.row), [3, 4, 5]);
  assert.match(r.errors[0].reason, /name/i);
  assert.match(r.errors[1].reason, /ID/);
  assert.match(r.errors[2].reason, /Duplicate/);
  assert.equal(r.totalRows, 5);
});

test("rejects over-long values per row", async () => {
  const buf = await workbook((ws) => {
    ws.addRow(["Student Name", "Student ID", "Parent Phone"]);
    ws.addRow(["n".repeat(121), "A", ""]);
    ws.addRow(["Ok", "c".repeat(65), ""]);
    ws.addRow(["Ok2", "B", "9".repeat(31)]);
  });
  const r = await parseStudentWorkbook(buf);
  assert.equal(r.valid.length, 0);
  assert.equal(r.errors.length, 3);
});

test("a sheet without the required headers is explained, not crashed on", async () => {
  const buf = await workbook((ws) => {
    ws.addRow(["Surname", "Grade"]);
    ws.addRow(["Rao", "5"]);
  });
  const r = await parseStudentWorkbook(buf);
  assert.equal(r.valid.length, 0);
  assert.match(r.errors[0].reason, /Student Name/);
});

test("anything that isn't an .xlsx is rejected with UnreadableWorkbookError", async () => {
  await assert.rejects(parseStudentWorkbook(Buffer.from("Student Name,Student ID\nA,1\n")), UnreadableWorkbookError); // csv
  await assert.rejects(parseStudentWorkbook(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), UnreadableWorkbookError); // old .xls
  await assert.rejects(parseStudentWorkbook(Buffer.alloc(0)), UnreadableWorkbookError); // empty
  await assert.rejects(parseStudentWorkbook(Buffer.from("PK\x03\x04 not really a workbook")), UnreadableWorkbookError); // zip-looking junk
});

test("a 2,000-student roster parses quickly and completely", async () => {
  const buf = await workbook((ws) => {
    ws.addRow(["Student Name", "Student ID", "Parent Phone"]);
    for (let i = 1; i <= 2000; i++) ws.addRow([`Student ${i}`, `ID${String(i).padStart(4, "0")}`, `98${String(10000000 + i)}`]);
  });
  const started = Date.now();
  const r = await parseStudentWorkbook(buf);
  const ms = Date.now() - started;
  assert.deepEqual(r.errors, []);
  assert.equal(r.valid.length, 2000);
  assert.equal(r.valid[1999].studentCode, "ID2000");
  assert.equal(new Set(r.valid.map((v) => v.studentCode)).size, 2000);
  assert.ok(ms < 5000, `parsing took ${ms}ms`);
  console.log(`      (2,000 rows parsed in ${ms}ms, file ${Math.round(buf.length / 1024)} KB)`);
});
