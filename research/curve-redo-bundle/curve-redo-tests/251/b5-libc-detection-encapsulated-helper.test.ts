import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("libc detection encapsulated in a helper or const", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  // Heuristic: any of these markers indicates encapsulated libc detection.
  assert.match(src, /isGlibc|isMusl|detectLibc|libcFamily|glibcVersionRuntime|process\.report/);
});
