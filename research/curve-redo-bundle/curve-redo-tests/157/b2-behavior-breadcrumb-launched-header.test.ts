// Edge case: minimum/single-occurrence boundary — the post-launch breadcrumb
// must contain a 'Run launched' header (going from 0 occurrences in baseline
// to >=1 after the fix).

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

test("breadcrumb: cli emits a 'Run launched' header at the --confirm exit path", () => {
  assert.match(
    cliSrc,
    /Run\s+launched/i,
    "expected src/cli.ts to print a 'Run launched' breadcrumb after --confirm",
  );
});
