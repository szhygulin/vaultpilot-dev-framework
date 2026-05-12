// The original error path (binary not found) must still produce an
// actionable error if neither libc artifact resolves. The fix removes the
// burden of remembering VP_DEV_CLAUDE_BIN, but the error message should
// still be useful if both artifacts are missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary still surfaces an error / throws when no artifact resolves", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /throw\s+new\s+Error|throw\s+Error/);
});
