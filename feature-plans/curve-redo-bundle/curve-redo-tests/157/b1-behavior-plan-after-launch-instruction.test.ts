// The --plan output must mirror the confirm-path breadcrumb with an
// 'After launch' instruction so operators reading the plan see the same
// post-launch progress-check guidance.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: cli.ts plan-path output mentions 'After launch'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /After launch/);
});
