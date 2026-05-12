import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("no bare 'acknowledgedNonProtocolTarget = false' in actions.ts", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).not.toMatch(/acknowledgedNonProtocolTarget\s*=\s*false/);
});
