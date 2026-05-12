import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary does not make network calls (no fetch/axios/http)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.doesNotMatch(src, /\bfetch\(|\baxios\b|node:http\b|require\(["']https?["']/);
});
