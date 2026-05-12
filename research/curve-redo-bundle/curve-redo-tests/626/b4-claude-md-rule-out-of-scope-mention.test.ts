import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("CLAUDE.md rule mentions 'out-of-scope' alternative in Format guidance", () => {
  const src = readFileSync(resolve(process.cwd(), "CLAUDE.md"), "utf8");
  expect(src).toMatch(/out.of.scope|widen the fix|widen|surface.*gap/i);
});
