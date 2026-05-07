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

test("breadcrumb contract: usage-tone label (e.g. 'Check progress' / 'Live tail') sits next to `vp-dev status` on the same line", () => {
  assert.match(
    cliSource,
    /(check progress|live tail|live-tail|after launch)[^\n]{0,60}vp-dev status/i,
    "Breadcrumb must put the affordance label and `vp-dev status` on the same line for human + LLM scannability",
  );
});
