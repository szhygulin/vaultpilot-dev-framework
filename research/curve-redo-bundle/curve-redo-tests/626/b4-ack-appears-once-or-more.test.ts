import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("acknowledgedNonProtocolTarget appears at least once in actions.ts", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const matches = src.match(/acknowledgedNonProtocolTarget/g) || [];
  expect(matches.length).toBeGreaterThanOrEqual(1);
});
