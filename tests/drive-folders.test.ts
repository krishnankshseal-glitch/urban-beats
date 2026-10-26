import test from "node:test";
import assert from "node:assert/strict";
import {
  FOLDER_MIME,
  ensureFolder,
  escapeDriveQueryValue,
  isInaccessibleError,
} from "../src/lib/driveFolders";

type FakeFile = { id: string; name: string; parents: string[]; trashed: boolean; visible: boolean; mimeType: string };

const apiError = (code: number, reason?: string) =>
  Object.assign(new Error(`HTTP ${code}`), { code, errors: reason ? [{ reason }] : [] });

/** A stand-in for the Drive client that behaves like the real one where it matters:
 *  files the app can't see answer 404, searches page, queries are parsed with escapes. */
function makeDrive(seed: Partial<FakeFile>[] = [], opts: { pageSize?: number; getError?: unknown } = {}) {
  const pageSize = opts.pageSize ?? 100;
  const files: FakeFile[] = seed.map((f, i) => ({
    id: `seed${i}`, name: "", parents: [], trashed: false, visible: true, mimeType: FOLDER_MIME, ...f,
  }));
  const calls = { get: 0, list: 0, create: 0 };
  let created = 0;
  const unescape = (s: string) => s.replace(/\\(.)/g, "$1");
  const drive: any = {
    files: {
      async get({ fileId }: any) {
        calls.get++;
        if (opts.getError) throw opts.getError;
        const f = files.find((x) => x.id === fileId);
        if (!f || !f.visible) throw apiError(404);
        return { data: { id: f.id, trashed: f.trashed, mimeType: f.mimeType } };
      },
      async list({ q, pageToken }: any) {
        calls.list++;
        const name = /name = '((?:\\.|[^'\\])*)'/.exec(q);
        const parent = /'((?:\\.|[^'\\])*)' in parents/.exec(q);
        const matches = files.filter(
          (f) =>
            f.visible && !f.trashed && f.mimeType === FOLDER_MIME &&
            (!name || f.name === unescape(name[1])) &&
            (!parent || f.parents.includes(unescape(parent[1])))
        );
        const start = pageToken ? Number(pageToken) : 0;
        const page = matches.slice(start, start + pageSize);
        const next = start + pageSize < matches.length ? String(start + pageSize) : undefined;
        return { data: { files: page.map((f) => ({ id: f.id, name: f.name })), nextPageToken: next } };
      },
      async create({ requestBody }: any) {
        calls.create++;
        const id = `new${++created}`;
        files.push({ id, name: requestBody.name, mimeType: requestBody.mimeType, parents: requestBody.parents ?? [], trashed: false, visible: true });
        return { data: { id } };
      },
    },
  };
  return { drive, calls, files };
}

test("uses the remembered folder when it still works", async () => {
  const { drive, calls } = makeDrive([{ id: "root1", name: "Urban Beats Attendance" }]);
  const id = await ensureFolder(drive, { cachedId: "root1", name: "Urban Beats Attendance" });
  assert.equal(id, "root1");
  assert.equal(calls.create, 0);
  assert.equal(calls.list, 0);
});

test("heals a remembered folder this connection cannot see by finding its own folder by name", async () => {
  // This is the real production case: the stored ID came from the old service-account setup.
  const { drive, calls } = makeDrive([
    { id: "old-service-account-folder", name: "Urban Beats Attendance", visible: false },
    { id: "mine", name: "Urban Beats Attendance" },
  ]);
  const id = await ensureFolder(drive, { cachedId: "old-service-account-folder", name: "Urban Beats Attendance" });
  assert.equal(id, "mine");
  assert.equal(calls.create, 0);
});

test("creates a folder when nothing usable exists", async () => {
  const { drive, calls, files } = makeDrive();
  const id = await ensureFolder(drive, { cachedId: "gone", name: "Urban Beats Attendance" });
  assert.equal(id, "new1");
  assert.equal(calls.create, 1);
  assert.deepEqual(files.find((f) => f.id === "new1")?.parents, []);
});

test("creates inside the given parent", async () => {
  const { drive, files } = makeDrive();
  await ensureFolder(drive, { name: "2026", parentId: "class1" });
  assert.deepEqual(files.find((f) => f.id === "new1")?.parents, ["class1"]);
});

test("only matches folders inside the requested parent", async () => {
  const { drive, calls } = makeDrive([{ id: "elsewhere", name: "2026", parents: ["other-class"] }]);
  const id = await ensureFolder(drive, { name: "2026", parentId: "class1" });
  assert.notEqual(id, "elsewhere");
  assert.equal(calls.create, 1);
});

test("treats a trashed remembered folder as unusable", async () => {
  const { drive } = makeDrive([{ id: "binned", name: "Urban Beats Attendance", trashed: true }]);
  const id = await ensureFolder(drive, { cachedId: "binned", name: "Urban Beats Attendance" });
  assert.notEqual(id, "binned");
});

test("treats a 403 appNotAuthorizedToFile on the remembered folder as unusable", async () => {
  const { drive } = makeDrive([], { getError: apiError(403, "appNotAuthorizedToFile") });
  const id = await ensureFolder(drive, { cachedId: "someone-elses", name: "Urban Beats Attendance" });
  assert.equal(id, "new1");
});

test("does not swallow genuine errors", async () => {
  const { drive } = makeDrive([], { getError: apiError(500) });
  await assert.rejects(ensureFolder(drive, { cachedId: "x", name: "N" }), (e: any) => e.code === 500);
});

test("finds a class folder whose name has quotes and backslashes", async () => {
  const tricky = "Hip-Hop O'Neil \\ Advanced";
  const { drive, calls } = makeDrive([{ id: "tricky1", name: tricky, parents: ["root1"] }]);
  const id = await ensureFolder(drive, { name: tricky, parentId: "root1" });
  assert.equal(id, "tricky1");
  assert.equal(calls.create, 0);
});

test("follows every page of search results", async () => {
  const { drive, calls } = makeDrive(
    [{ name: "Dup" }, { name: "Dup" }, { name: "Dup" }],
    { pageSize: 2 }
  );
  const id = await ensureFolder(drive, { name: "Dup" });
  assert.equal(id, "seed0");
  assert.equal(calls.list, 2);
});

test("routes every Google call through the supplied wrapper", async () => {
  const { drive } = makeDrive();
  let wrapped = 0;
  await ensureFolder(drive, { cachedId: "gone", name: "N", run: (fn) => { wrapped++; return fn(); } });
  assert.equal(wrapped, 3); // get remembered, search, create
});

test("escapeDriveQueryValue escapes backslashes before quotes", () => {
  assert.equal(escapeDriveQueryValue("a'b"), "a\\'b");
  assert.equal(escapeDriveQueryValue("a\\b"), "a\\\\b");
  assert.equal(escapeDriveQueryValue("\\'"), "\\\\\\'");
});

test("isInaccessibleError recognises exactly the cases that mean 'not usable'", () => {
  assert.equal(isInaccessibleError(apiError(404)), true);
  assert.equal(isInaccessibleError(apiError(403, "appNotAuthorizedToFile")), true);
  assert.equal(isInaccessibleError(apiError(403, "insufficientFilePermissions")), true);
  assert.equal(isInaccessibleError(apiError(403, "userRateLimitExceeded")), false);
  assert.equal(isInaccessibleError(apiError(500)), false);
  assert.equal(isInaccessibleError(new Error("plain")), false);
});
