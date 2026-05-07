// Edge case: empty-output boundary — the 'vp-dev status' mention must be
// inside a printable string literal (heuristic: a quote/backtick within the
// preceding 100 chars), so it actually reaches stdout, not just a comment.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function loadCli(): string {
  const cwd = resolve(process.cwd(), "src/cli.ts");
  if (existsSync(cwd)) return readFileSync(cwd, "utf8");
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const p = resolve(dir, "src/cli.ts");
    if (existsSync(p)) return readFileSync(p, "utf8");
    dir = resolve(dir, "..");
  }
  throw new Error("src/cli.ts not found");
}

const cliSrc = loadCli();

test("breadcrumb: 'vp-dev status' is inside a string-literal context (printable output)", () => {
  const idx = cliSrc.indexOf("vp-dev status");
  assert.ok(idx !== -1, "expected 'vp-dev status' literal in cli.ts");
  const before = cliSrc.slice(Math.max(0, idx - 100), idx);
  assert.match(
    before,
    /["'`]/,
    "expected a string-literal opener (quote or backtick) within 100 chars before 'vp-dev status'",
  );
});
