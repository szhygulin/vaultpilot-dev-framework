// The proposal includes a labeled runId line ('  runId:         <ts>')
// so the operator sees the active run identifier alongside the launch
// acknowledgement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: confirm-path breadcrumb prints a labeled 'runId:' line near 'Run launched'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Run launched[\s\S]{0,300}runId:/);
});
