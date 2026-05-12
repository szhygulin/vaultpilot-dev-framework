// Prompt resume block pushed before workflow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b9 prompt sections resume block placement", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/prompt.ts"), "utf8");
  assert.match(src, /Previous attempt[\s\S]*?workflow\.trim|opts\.resumeContext[\s\S]*?workflow/);
});
