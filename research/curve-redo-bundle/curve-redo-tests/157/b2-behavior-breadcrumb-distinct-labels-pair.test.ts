// Edge case: collection-min boundary — at least 2 of the 4 breadcrumb labels
// from the issue spec ('Run launched', 'Check progress', 'Live tail',
// 'After launch') must appear, since the breadcrumb introduces multiple
// labelled affordances.

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

test("breadcrumb: at least 2 distinct breadcrumb labels appear in cli.ts", () => {
  const labels = [
    /Run\s+launched/i,
    /check\s+progress/i,
    /live\s+tail/i,
    /after\s+launch/i,
  ];
  const present = labels.filter((re) => re.test(cliSrc)).length;
  assert.ok(
    present >= 2,
    `expected >=2 breadcrumb labels (Run launched / Check progress / Live tail / After launch), got ${present}`,
  );
});
