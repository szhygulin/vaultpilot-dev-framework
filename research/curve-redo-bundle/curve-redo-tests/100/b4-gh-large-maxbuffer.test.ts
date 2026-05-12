// Sets maxBuffer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b4 gh large maxbuffer", () => {
  const src = readFileSync(resolve(process.cwd(), "src/github/gh.ts"), "utf8");
  assert.match(src, /maxBuffer/);
});
