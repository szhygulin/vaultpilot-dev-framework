// Edge case: off-by-one indentation boundary — the issue's proposed format
// has 2-space leading indent before each breadcrumb command line. At least
// one occurrence of 'vp-dev status' must be preceded by >=2 spaces.

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

test("breadcrumb: at least one indented (>=2 spaces) 'vp-dev status' line exists", () => {
  assert.match(
    cliSrc,
    / {2,}vp-dev status/,
    "expected indented breadcrumb formatting (>=2 spaces before 'vp-dev status')",
  );
});
