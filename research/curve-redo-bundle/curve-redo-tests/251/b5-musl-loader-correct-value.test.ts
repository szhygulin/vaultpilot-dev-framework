import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("MUSL_LOADER_PATH still resolves to /lib/ld-musl-x86_64.so.1", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /\/lib\/ld-musl-x86_64\.so\.1/);
});
