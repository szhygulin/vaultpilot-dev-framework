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

test("breadcrumb contract: bare `vp-dev status` form (no `<runid>` placeholder) is documented", () => {
  // Pre-condition: breadcrumb body must exist.
  assert.match(
    cliSource,
    /check progress|live tail|run launched|after launch/i,
    "Pre-condition: breadcrumb missing — no 'progress' / 'launch' affordance label found",
  );
  // Match `vp-dev status` followed by whitespace+(end of literal | comment | --watch | newline | quote)
  // i.e. NOT followed by a positional arg-like token.
  assert.match(
    cliSource,
    /vp-dev status(?=\s*(?:#|--watch|`|'|"|\n|$|\\n))/m,
    "Breadcrumb must show bare `vp-dev status` (no positional <runid> placeholder)",
  );
});
