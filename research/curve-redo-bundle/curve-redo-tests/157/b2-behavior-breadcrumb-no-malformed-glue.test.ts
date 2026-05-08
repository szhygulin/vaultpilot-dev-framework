// Edge case: off-by-one whitespace boundary (negative) — guard against an
// implementation that omits the space between command and flag, producing
// a malformed 'vp-dev status--watch' that would not parse.

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

test("breadcrumb: no malformed glued 'vp-dev status--watch' AND well-formed form present", () => {
  // Must NOT contain malformed glued form
  assert.ok(
    !cliSrc.includes("vp-dev status--watch"),
    "unexpected malformed 'vp-dev status--watch' (no space)",
  );
  // Must contain well-formed form
  assert.ok(
    cliSrc.includes("vp-dev status --watch"),
    "expected well-formed 'vp-dev status --watch' breadcrumb",
  );
});
