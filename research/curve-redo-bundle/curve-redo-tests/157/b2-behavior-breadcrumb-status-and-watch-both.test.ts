// Edge case: two-element collection boundary — both forms (no-args and
// --watch) must be advertised. Either alone is incomplete.

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

test("breadcrumb: cli mentions BOTH 'vp-dev status' and '--watch'", () => {
  assert.ok(cliSrc.includes("vp-dev status"), "missing 'vp-dev status'");
  assert.ok(cliSrc.includes("--watch"), "missing '--watch'");
});
