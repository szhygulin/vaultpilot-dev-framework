// Defensive: the fix should be confined to curve/actions.ts. We do NOT
// assert other modules cannot stamp the flag (they may), but verify the
// canonical site is in curve/actions.ts.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("acknowledgedNonProtocolTarget is set in curve/actions.ts (canonical site)", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/acknowledgedNonProtocolTarget\s*[:=]\s*true/);
});
