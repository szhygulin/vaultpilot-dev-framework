import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function findRepoFile(relPath: string): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    const candidate = resolve(dir, relPath);
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not find ${relPath}`);
}

const cliSource = readFileSync(findRepoFile("src/cli.ts"), "utf8");

test("breadcrumb contract: must NOT recommend pgrep / ls / tail as the canonical progress check", () => {
  // Pre-condition: breadcrumb body must be added.
  const idx = cliSource.search(/run launched/i);
  assert.ok(idx !== -1, "Pre-condition: breadcrumb body missing");
  // Within the breadcrumb block (~500 chars), should not promote shell-grovel.
  const block = cliSource.slice(idx, idx + 500);
  assert.doesNotMatch(
    block,
    /pgrep|ls\s+-l|tail\s+-f/i,
    "Breadcrumb must not promote shell-grovel approaches (pgrep/ls/tail) — `vp-dev status` is the canonical tool",
  );
});
