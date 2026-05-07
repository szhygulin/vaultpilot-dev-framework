// Edge case: proximity boundary — the --watch hint must live inside the
// breadcrumb block, not just the existing status command flag definition.

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

test("breadcrumb: '--watch' appears within 400 chars of the 'Run launched' header", () => {
  const idx = cliSrc.search(/Run\s+launched/i);
  assert.ok(idx !== -1, "expected 'Run launched' header in cli.ts");
  const window = cliSrc.slice(idx, idx + 400);
  assert.ok(
    window.includes("--watch"),
    "expected '--watch' live-tail hint within ~400 chars of 'Run launched'",
  );
});
