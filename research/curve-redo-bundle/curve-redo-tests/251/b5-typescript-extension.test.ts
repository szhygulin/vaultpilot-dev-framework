import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary lives at src/agent/sdkBinary.ts (TS)", () => {
  assert.equal(existsSync(resolve(process.cwd(), "src/agent/sdkBinary.ts")), true);
});
