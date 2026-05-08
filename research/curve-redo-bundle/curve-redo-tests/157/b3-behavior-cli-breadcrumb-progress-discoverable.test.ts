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

test("breadcrumb contract: cli.ts must expose at least one canonical progress-check affordance", () => {
  // The issue's whole premise: launch-time breadcrumb pointing at `vp-dev status`.
  // The new code MUST contain at least one of these signature phrases — without one,
  // the discoverability gap remains and operators will shell-grovel.
  const hasAffordance =
    /check progress[^\n]{0,40}vp-dev status/i.test(cliSource) ||
    /live tail[^\n]{0,40}vp-dev status/i.test(cliSource) ||
    /after launch[\s\S]{0,200}vp-dev status/i.test(cliSource) ||
    /run launched[\s\S]{0,300}vp-dev status/i.test(cliSource);
  assert.ok(
    hasAffordance,
    "cli.ts must expose at least one canonical progress-check breadcrumb pointing at `vp-dev status`",
  );
});
