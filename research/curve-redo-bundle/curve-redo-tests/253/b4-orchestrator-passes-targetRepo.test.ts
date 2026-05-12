import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("orchestrator.ts passes targetRepo to fetchOriginMain", () => {
  const src = readFileSync(resolve(process.cwd(), "src/orchestrator/orchestrator.ts"), "utf8");
  assert.match(src, /fetchOriginMain\([^)]*targetRepo/);
});
