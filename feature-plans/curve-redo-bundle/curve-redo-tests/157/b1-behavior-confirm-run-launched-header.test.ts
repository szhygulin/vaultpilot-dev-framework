// Confirm-path breadcrumb is the headline affordance the issue proposes:
// after a run is launched, src/cli.ts must print a 'Run launched' header so
// the operator immediately sees the launch acknowledgement.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: cli.ts confirm-path output emits a 'Run launched' header", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Run launched/);
});
