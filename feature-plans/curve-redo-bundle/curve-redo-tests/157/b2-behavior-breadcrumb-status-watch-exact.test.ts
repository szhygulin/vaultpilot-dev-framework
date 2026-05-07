// Edge case: exact-string boundary — the live-tail hint must be the exact
// 'vp-dev status --watch' string (single space, double-dash flag).

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

test("breadcrumb: literal 'vp-dev status --watch' appears in cli source", () => {
  assert.ok(
    cliSrc.includes("vp-dev status --watch"),
    "expected exact 'vp-dev status --watch' live-tail hint",
  );
});
