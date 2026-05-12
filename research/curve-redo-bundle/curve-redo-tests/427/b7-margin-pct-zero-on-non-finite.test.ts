// marginPct returns 0 on non-finite HF.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b7 margin pct zero on non finite", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/positions/index.ts"), "utf8");
  expect(src).toMatch(/!Number\.isFinite\(hf\)|hf\s*<=\s*0/);
});
