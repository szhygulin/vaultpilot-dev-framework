// Edge case: pair / off-by-one boundary — the breadcrumb is added in TWO
// places (the --plan output AND the --confirm exit path), so 'vp-dev status'
// must appear at least twice in the source.

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

function countOccurrences(s: string, sub: string): number {
  let n = 0, i = 0;
  while ((i = s.indexOf(sub, i)) !== -1) { n++; i += sub.length; }
  return n;
}

const cliSrc = loadCli();

test("breadcrumb: 'vp-dev status' appears at least twice (--plan + --confirm paths)", () => {
  const count = countOccurrences(cliSrc, "vp-dev status");
  assert.ok(
    count >= 2,
    `expected at least 2 mentions of 'vp-dev status' (one per code path), got ${count}`,
  );
});
