// Edge case: empty-change boundary — the diff must add at least ONE of the
// new breadcrumb phrases, otherwise the fix is empty.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function loadCli(): string {
  const cwd = resolve(process.cwd(), "src/cli.ts");
  if (existsSync(cwd)) return readFileSync(cwd, "utf8");
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const p = resolve(dir, "src/cli.ts");
    if (existsSync(p)) return readFileSync(p, "utf8");
    dir = resolve(dir, "..");
  }
  throw new Error("src/cli.ts not found");
}

const cliSrc = loadCli();

test("breadcrumb: cli.ts contains at least one launch-breadcrumb phrase", () => {
  const phrases = [
    /Run\s+launched/i,
    /check\s+progress/i,
    /live\s+tail/i,
    /after\s+launch/i,
  ];
  const matched = phrases.some((re) => re.test(cliSrc));
  assert.ok(matched, "expected at least one breadcrumb phrase to be added to cli.ts");
});
