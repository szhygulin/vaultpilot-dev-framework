import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("cli.ts cmdSpawn passes targetRepo to fetchOriginMain", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /fetchOriginMain\([^)]*targetRepo/);
});
