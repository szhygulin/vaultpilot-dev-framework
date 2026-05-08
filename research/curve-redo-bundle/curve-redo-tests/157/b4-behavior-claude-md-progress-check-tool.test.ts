// Beyond just naming the command, CLAUDE.md should give it canonical
// framing so the LLM agent reaches for it instead of pgrep / ls -lt.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("CLAUDE.md frames vp-dev status as the canonical progress-check", () => {
  const src = readFileSync(resolve(process.cwd(), "CLAUDE.md"), "utf8");
  // Look for canonical/progress framing near the 'vp-dev status' mention.
  const idx = src.search(/vp-dev status/);
  assert.ok(idx >= 0, "CLAUDE.md should mention 'vp-dev status'");
  const region = src.slice(Math.max(0, idx - 400), idx + 400);
  assert.match(region, /progress|canonical|status|how is the run going|check/i);
});
