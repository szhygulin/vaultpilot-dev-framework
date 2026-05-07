// The confirm-path breadcrumb (printed after a run is launched) must offer
// both modes: canonical 'vp-dev status' on the 'Check progress' line, and
// 'vp-dev status --watch' on the 'Live tail' line.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("happy: confirm breadcrumb offers both canonical 'vp-dev status' and 'vp-dev status --watch'", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  const launched = src.indexOf("Run launched");
  assert.ok(launched >= 0, "'Run launched' missing from cli.ts confirm path");
  const confirmBlock = src.slice(launched, launched + 800);
  // Canonical (no args) -- not followed by --watch on the same logical line.
  assert.match(
    confirmBlock,
    /vp-dev status\b(?!\s*--watch)/,
    "confirm breadcrumb missing canonical 'vp-dev status' (no args)",
  );
  // --watch variant.
  assert.match(
    confirmBlock,
    /vp-dev status --watch/,
    "confirm breadcrumb missing 'vp-dev status --watch'",
  );
});
