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

test("breadcrumb contract: 'vp-dev status' must appear at least twice in cli.ts (active + watch)", () => {
  // Pre-condition: breadcrumb body must exist (this is what differentiates baseline).
  assert.match(
    cliSource,
    /check progress|live tail|after launch|run launched/i,
    "Pre-condition: breadcrumb body missing — no progress affordance in cli.ts",
  );
  const occurrences = cliSource.split("vp-dev status").length - 1;
  assert.ok(
    occurrences >= 2,
    `Expected at least 2 occurrences of 'vp-dev status' in cli.ts (active form + --watch form), found ${occurrences}`,
  );
});
