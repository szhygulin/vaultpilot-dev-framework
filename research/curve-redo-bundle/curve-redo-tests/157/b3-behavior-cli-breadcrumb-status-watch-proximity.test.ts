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

test("breadcrumb contract: 'vp-dev status' and '--watch' must appear within ~300 chars (same block)", () => {
  assert.match(
    cliSource,
    /check progress|live tail|run launched|after launch/i,
    "Pre-condition: breadcrumb body missing",
  );
  let foundClose = false;
  let from = 0;
  while (from < cliSource.length) {
    const s = cliSource.indexOf("vp-dev status", from);
    if (s === -1) break;
    const w = cliSource.indexOf("--watch", s);
    if (w !== -1 && w - s <= 300) {
      foundClose = true;
      break;
    }
    from = s + 1;
  }
  assert.ok(
    foundClose,
    "Expected `vp-dev status` and `--watch` to appear within 300 chars (same breadcrumb block)",
  );
});
