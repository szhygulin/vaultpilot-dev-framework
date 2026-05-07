// Edge case: two-path boundary — the breadcrumb is added in TWO places
// (--confirm exit AND --plan output), so both anchor labels must appear.

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

test("breadcrumb: both 'Run launched' (confirm path) and 'After launch' (plan path) hints exist", () => {
  assert.match(cliSrc, /Run\s+launched/i, "expected confirm-path 'Run launched' header");
  assert.match(cliSrc, /after\s+launch/i, "expected plan-path 'After launch' hint");
});
