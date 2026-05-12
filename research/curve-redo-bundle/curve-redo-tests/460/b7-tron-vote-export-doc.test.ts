// TRON vote doc comment cites Inv #14 / #460.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 tron vote export doc", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/tron/actions.ts"), "utf8");
  expect(src).toMatch(/Inv\s*#?14|Invariant\s*#?14|#460/i);
});
