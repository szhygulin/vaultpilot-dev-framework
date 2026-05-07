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
  throw new Error(`Could not find ${relPath} from ${fileURLToPath(import.meta.url)}`);
}

const cliSource = readFileSync(findRepoFile("src/cli.ts"), "utf8");

test("breadcrumb contract: cli.ts must include a 'Check progress' / 'progress check' label", () => {
  // Without this label, callers cannot discover `vp-dev status` and shell-grovel instead.
  assert.match(
    cliSource,
    /check progress|progress check|how to check progress/i,
    "cli.ts must contain a 'Check progress' (or equivalent) label after run launch",
  );
});
