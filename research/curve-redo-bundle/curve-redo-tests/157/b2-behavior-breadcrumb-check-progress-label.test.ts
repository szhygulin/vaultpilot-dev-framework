// Edge case: minimum-label boundary — at least one 'Check progress' label
// must accompany the status hint (per the proposed copy in the issue).

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

test("breadcrumb: cli output uses a 'check progress' phrasing for the status hint", () => {
  assert.match(
    cliSrc,
    /check\s+progress/i,
    "expected a 'Check progress' label as the breadcrumb introducing 'vp-dev status'",
  );
});
