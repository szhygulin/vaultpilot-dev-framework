// The proposed primary mechanism (from the issue body) is
// process.report.getReport().header.glibcVersionRuntime — defined string
// on glibc, undefined on musl.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("sdkBinary references glibcVersionRuntime or an equivalent libc probe", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  assert.match(src, /glibcVersionRuntime|getReport|ldd|isGlibc|isMusl|detectLibc/i);
});
