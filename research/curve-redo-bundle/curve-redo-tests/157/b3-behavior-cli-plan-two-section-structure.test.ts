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

test("--plan contract: must structure output as 'launch this run' + 'after launch' two-section block", () => {
  const launchSection =
    /to launch this run|launch this run|run --confirm/i.test(cliSource);
  const postLaunchSection =
    /after launch|once launched|after launching/i.test(cliSource);
  assert.ok(launchSection, "--plan output should retain the 'launch this run' guidance");
  assert.ok(postLaunchSection, "--plan output should add the 'after launch' guidance for progress check");
});
