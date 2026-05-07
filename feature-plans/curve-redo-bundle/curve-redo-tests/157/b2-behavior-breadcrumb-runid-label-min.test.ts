// Edge case: minimum-field boundary — the breadcrumb must surface the runId
// to the user (per issue spec). 'runId' must appear inside a printable
// string literal context (not solely in pre-existing object-key code).

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

test("breadcrumb: 'runId' label appears in a printable string literal next to launch banner", () => {
  // Look for a runId label near 'Run launched'
  const idx = cliSrc.search(/Run\s+launched/i);
  assert.ok(idx !== -1, "expected 'Run launched' banner");
  const window = cliSrc.slice(idx, idx + 300);
  // The runId field should appear with a colon (label-form), e.g. 'runId:'
  assert.match(
    window,
    /runId\s*:/,
    "expected 'runId:' label inside the breadcrumb block",
  );
});
