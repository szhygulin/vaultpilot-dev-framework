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

test("breadcrumb contract: explicit `--watch` (double-dash) form documented in breadcrumb", () => {
  // Pre-condition: breadcrumb body added.
  assert.match(
    cliSource,
    /check progress|live tail|run launched|after launch/i,
    "Pre-condition: breadcrumb missing",
  );
  assert.ok(
    cliSource.includes("--watch"),
    "Breadcrumb must document the explicit `--watch` double-dash flag",
  );
});
