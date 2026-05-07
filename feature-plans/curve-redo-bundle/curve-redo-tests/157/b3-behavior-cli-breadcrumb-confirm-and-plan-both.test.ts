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

test("breadcrumb contract: both confirm-exit and --plan paths must reference `vp-dev status`", () => {
  const confirmHas = /run launched[\s\S]{0,500}vp-dev status/i.test(cliSource);
  const planHas =
    /(after launch|once launched)[\s\S]{0,500}vp-dev status/i.test(cliSource) ||
    /vp-dev run --confirm[\s\S]{0,1000}vp-dev status/i.test(cliSource);
  assert.ok(confirmHas, "Confirm-exit breadcrumb must mention `vp-dev status`");
  assert.ok(planHas, "--plan output must mention `vp-dev status` after the launch token hint");
});
