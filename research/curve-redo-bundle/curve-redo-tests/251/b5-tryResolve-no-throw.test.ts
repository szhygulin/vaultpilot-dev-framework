import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("tryResolve/equivalent wraps in try/catch to avoid throw", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /try\s*\{[\s\S]*?\}\s*catch/);
});
