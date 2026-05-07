// The plan-path breadcrumb instruction must come before the watch command
// suggestion in source order, so the formatted output reads top-down.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: plan-path block orders 'After launch' before 'vp-dev status --watch' suggestion", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const afterLaunchIdx = src.indexOf("After launch");
  assert.ok(afterLaunchIdx >= 0, "'After launch' missing from cli.ts");
  const watchIdx = src.indexOf("vp-dev status --watch", afterLaunchIdx);
  assert.ok(
    watchIdx > afterLaunchIdx,
    "'vp-dev status --watch' must appear after 'After launch' in plan-path block",
  );
});
