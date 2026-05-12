// cli.ts comment updated to reference #119 alongside #118.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b9 cli issue 118 comment updated", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /#118[\s\S]*?#119|#119[\s\S]*?#118/);
});
