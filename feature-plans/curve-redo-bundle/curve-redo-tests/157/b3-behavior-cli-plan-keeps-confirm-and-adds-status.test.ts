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

test("--plan output: must keep existing --confirm hint AND add post-launch progress hint", () => {
  assert.match(
    cliSource,
    /vp-dev run --confirm/i,
    "Existing `vp-dev run --confirm <token>` hint must remain after the patch (no regression)",
  );
  assert.match(
    cliSource,
    /(after launch|once launched)[^]{0,500}vp-dev status/i,
    "Plan output must add a post-launch breadcrumb mentioning `vp-dev status`",
  );
});
