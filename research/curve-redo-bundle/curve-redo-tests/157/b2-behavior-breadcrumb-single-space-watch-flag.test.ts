// Edge case: off-by-one whitespace boundary — the issue's literal hint is
// 'vp-dev status --watch' (single space). Reject the malformed glued form
// 'vp-dev status--watch' (no space) AND require the well-formed form.

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

test("breadcrumb: '--watch' flag is separated from 'vp-dev status' by exactly one space", () => {
  assert.ok(
    cliSrc.includes("vp-dev status --watch"),
    "expected well-formed 'vp-dev status --watch' (single space)",
  );
  assert.ok(
    !cliSrc.includes("vp-dev status--watch"),
    "unexpected glued 'vp-dev status--watch' form",
  );
});
