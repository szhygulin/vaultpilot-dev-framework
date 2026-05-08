// Edge case: proximity / off-by-one boundary — at least one '--watch' must
// follow 'vp-dev status' within 30 chars (i.e. anchored as the live-tail
// breadcrumb), not just appear randomly elsewhere in the file.

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

test("breadcrumb: '--watch' appears within 30 chars after 'vp-dev status' at least once", () => {
  assert.match(
    cliSrc,
    /vp-dev status[^\n]{0,30}--watch/,
    "expected '--watch' anchored as the live-tail variant of 'vp-dev status'",
  );
});
