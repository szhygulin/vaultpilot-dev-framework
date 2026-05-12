import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("preflight defaults resolveMuslBin to defaultResolveMuslBin", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /deps\.resolveMuslBin\s*\?\?\s*defaultResolveMuslBin|resolveMusl\s*=\s*defaultResolveMuslBin/);
});
