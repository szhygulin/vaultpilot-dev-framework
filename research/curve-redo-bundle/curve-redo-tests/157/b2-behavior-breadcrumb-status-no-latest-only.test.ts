// Edge case: off-by-one form boundary — the issue explicitly says the
// canonical form is no-args 'vp-dev status', not 'vp-dev status --latest'.
// At least one occurrence of 'vp-dev status' must NOT be glued to '--latest'.

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

test("breadcrumb: at least one 'vp-dev status' is NOT followed by '--latest'", () => {
  // Match 'vp-dev status' not immediately followed by '--latest' (canonical no-args form).
  assert.match(
    cliSrc,
    /vp-dev status(?!\s*--latest\b)/,
    "expected canonical no-args 'vp-dev status' (not '--latest') as a documented form",
  );
});
