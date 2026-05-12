import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("preflight defaults resolveGlibcBin to defaultResolveGlibcBin", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /deps\.resolveGlibcBin\s*\?\?\s*defaultResolveGlibcBin|resolveGlibc\s*=\s*defaultResolveGlibcBin/);
});
