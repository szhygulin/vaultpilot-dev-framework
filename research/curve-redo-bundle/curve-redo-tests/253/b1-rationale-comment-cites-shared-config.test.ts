// The doc comment near the fix should explain WHY the strip needed a
// counterpart restore — because .git/config is shared across worktrees.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("replay.ts cites the shared .git/config mutation as the bug's mechanism", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/replay.ts"), "utf8");
  assert.match(src, /shared.*\.git\/config|\.git\/config.*shared|cross-cell|sibling cell|subsequent cell/i);
});
