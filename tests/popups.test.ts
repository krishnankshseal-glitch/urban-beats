import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Admin and teacher pages sit inside an animated wrapper (admin/template.tsx) that keeps
// `will-change: transform`. Anything `position: fixed` rendered INSIDE it is positioned against
// the wrapper instead of the screen, so a popup ends up far below the visible area - and with the
// page scroll-locked, unreachable. These guard against that coming back. (Found by running the
// real page in a headless browser; see the PR.)

test("Modal renders through a portal into <body>", () => {
  const src = read("src/components/ui/Modal.tsx");
  assert.match(src, /createPortal\(/);
  assert.match(src, /document\.body/);
});

test("ConfirmDialog renders through a portal into <body>", () => {
  const src = read("src/components/ui/ConfirmDialog.tsx");
  assert.match(src, /createPortal\(/);
});

test("the scroll lock pins the page in place and restores the scroll position", () => {
  const src = read("src/lib/useBodyScrollLock.ts");
  assert.match(src, /position = "fixed"/);
  assert.match(src, /window\.scrollTo\(0, savedScrollY\)/);
});

test("both page-transition wrappers still exist (if they are removed, this guard can be relaxed)", () => {
  assert.match(read("src/app/admin/template.tsx"), /motion\.div/);
  assert.match(read("src/app/teacher/template.tsx"), /motion\.div/);
});
