// Edge case: minimum-label boundary — the --watch hint must carry a
// human-readable label (the issue uses 'Live tail'; accept any phrasing
// containing 'live' near '--watch').

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

test("breadcrumb: 'Live tail' label (or equivalent) introduces the --watch hint", () => {
  assert.match(
    cliSrc,
    /live\s+tail/i,
    "expected 'Live tail' label alongside the '--watch' breadcrumb",
  );
});
