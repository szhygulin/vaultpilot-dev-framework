// cli builds Map<number, ResumeContext>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b9 cli resume context by issue typed", () => {
  const src = readFileSync(resolve(process.cwd(), "src/cli.ts"), "utf8");
  assert.match(src, /Map<\s*number\s*,\s*ResumeContext\s*>/);
});
