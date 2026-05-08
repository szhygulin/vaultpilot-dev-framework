import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("bigint-buffer patch contains unified diff markers", () => {
  const body = readFileSync(
    join(ROOT, "patches", "bigint-buffer+1.1.5.patch"),
    "utf8",
  );
  // patch-package emits diffs that include `diff --git`, `---`, `+++`, and `@@` hunks.
  expect(body).toMatch(/^diff --git/m);
  expect(body).toMatch(/^---/m);
  expect(body).toMatch(/^\+\+\+/m);
  expect(body).toMatch(/^@@/m);
});
