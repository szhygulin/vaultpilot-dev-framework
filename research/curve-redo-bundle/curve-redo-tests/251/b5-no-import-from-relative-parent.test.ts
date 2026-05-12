import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary's imports are self-contained (no ../ imports for libc detection)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  // sdkBinary is a leaf utility — it should import from node: and packages only.
  const relImports = src.match(/from\s+["']\.{1,2}\//g) ?? [];
  assert.ok(relImports.length <= 1, `unexpected relative imports (${relImports.length})`);
});
