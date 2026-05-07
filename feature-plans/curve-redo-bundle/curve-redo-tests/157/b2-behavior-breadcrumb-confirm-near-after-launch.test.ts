// Edge case: proximity boundary in --plan path — the --plan output must keep
// the existing '--confirm <token>' hint AND introduce the 'After launch'
// progress hint within the same printed block.

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

test("breadcrumb: --plan path keeps '--confirm' hint near the 'After launch' breadcrumb", () => {
  const idx = cliSrc.search(/after\s+launch/i);
  assert.ok(idx !== -1, "expected 'After launch' hint in --plan output");
  const start = Math.max(0, idx - 500);
  const window = cliSrc.slice(start, idx + 500);
  assert.ok(
    window.includes("--confirm"),
    "expected '--confirm' token hint adjacent to 'After launch' breadcrumb",
  );
});
