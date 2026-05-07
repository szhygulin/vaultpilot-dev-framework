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

test("--plan contract: post-launch block must mention `--watch` for live tail", () => {
  // Look for a 'plan' / 'after launch' affordance followed by --watch within ~800 chars.
  assert.match(
    cliSource,
    /(after launch|once launched|vp-dev run --confirm)[\s\S]{0,800}--watch/i,
    "--plan output must mention `--watch` within the post-launch instructions",
  );
});
