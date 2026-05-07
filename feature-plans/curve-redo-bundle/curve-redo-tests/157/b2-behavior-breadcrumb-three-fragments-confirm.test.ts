// Edge case: collection-min boundary — the confirm-path breadcrumb has 3
// fragments per the issue: 'Run launched' header, 'vp-dev status' line,
// 'vp-dev status --watch' line. All three must be present.

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

test("breadcrumb: confirm-path breadcrumb has all 3 fragments", () => {
  assert.match(cliSrc, /Run\s+launched/i, "missing 'Run launched' fragment");
  assert.ok(cliSrc.includes("vp-dev status"), "missing 'vp-dev status' fragment");
  assert.ok(cliSrc.includes("vp-dev status --watch"), "missing 'vp-dev status --watch' fragment");
});
