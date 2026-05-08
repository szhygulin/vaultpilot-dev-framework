// Edge case: proximity boundary — the --plan-mode 'After launch' hint must
// be followed by the 'vp-dev status' command line within the same block.

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

test("breadcrumb: 'vp-dev status' appears within 400 chars of 'After launch' --plan hint", () => {
  const idx = cliSrc.search(/after\s+launch/i);
  assert.ok(idx !== -1, "expected 'After launch' hint in --plan output");
  const window = cliSrc.slice(idx, idx + 400);
  assert.ok(
    window.includes("vp-dev status"),
    "expected 'vp-dev status' within ~400 chars of 'After launch'",
  );
});
