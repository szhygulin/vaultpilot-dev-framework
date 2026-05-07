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

test("breadcrumb contract: launch marker and '--watch' line are separated by >= 2 newlines (multi-line block)", () => {
  const idxLaunch = cliSource.search(/run launched/i);
  assert.ok(idxLaunch !== -1, "Breadcrumb missing 'Run launched' marker");
  const idxWatch = cliSource.indexOf("vp-dev status --watch", idxLaunch);
  assert.ok(
    idxWatch !== -1 && idxWatch - idxLaunch < 1000,
    "Expected 'vp-dev status --watch' within 1000 chars of launch marker",
  );
  const slice = cliSource.slice(idxLaunch, idxWatch);
  const newlines = (slice.match(/\n/g) ?? []).length;
  assert.ok(
    newlines >= 2,
    `Breadcrumb should span multiple lines; expected >= 2 newlines between launch marker and watch line, got ${newlines}`,
  );
});
