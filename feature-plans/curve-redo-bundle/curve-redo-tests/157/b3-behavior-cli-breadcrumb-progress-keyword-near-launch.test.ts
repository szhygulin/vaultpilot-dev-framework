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

test("breadcrumb contract: 'progress' keyword must appear within ~500 chars of the launch marker", () => {
  const idx = cliSource.search(/run launched/i);
  assert.ok(idx !== -1, "Pre-condition: breadcrumb 'Run launched' marker missing");
  const block = cliSource.slice(idx, idx + 500);
  assert.match(
    block,
    /progress/i,
    "Breadcrumb block must include the word 'progress' so callers find the affordance",
  );
});
