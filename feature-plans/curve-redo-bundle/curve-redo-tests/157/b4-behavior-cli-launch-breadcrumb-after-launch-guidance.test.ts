// The plan output mirrors the confirm-exit breadcrumb. The issue body
// proposes 'After launch, check progress with:' as the section header.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("src/cli.ts plan output references 'After launch' progress guidance", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /After launch/i);
});
