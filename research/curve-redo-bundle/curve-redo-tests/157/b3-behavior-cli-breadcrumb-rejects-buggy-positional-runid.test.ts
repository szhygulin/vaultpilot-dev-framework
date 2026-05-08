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

test("breadcrumb contract: must NOT recommend buggy `vp-dev status <runid>` positional form", () => {
  // Pre-condition: breadcrumb must be added (otherwise this test would trivially pass on baseline).
  assert.match(
    cliSource,
    /check progress|live tail|run launched|after launch/i,
    "Pre-condition: breadcrumb body missing — no canonical progress affordance documented",
  );
  // Per the issue, `vp-dev status <runid>` is the buggy form and must NOT be promoted.
  assert.doesNotMatch(
    cliSource,
    /vp-dev status\s+<run[- ]?id>/i,
    "Breadcrumb must not promote the buggy positional `vp-dev status <runid>` form",
  );
});
