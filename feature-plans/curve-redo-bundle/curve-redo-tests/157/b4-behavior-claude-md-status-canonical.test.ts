// Companion edit from the issue: 'The project CLAUDE.md should also
// name `vp-dev status` as the canonical progress-check tool so a fresh
// agent reads the rule before reaching for `pgrep`.'

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("CLAUDE.md mentions `vp-dev status` as the progress-check tool", () => {
  const src = readFileSync(resolve(process.cwd(), "CLAUDE.md"), "utf8");
  assert.match(src, /vp-dev status/);
});
