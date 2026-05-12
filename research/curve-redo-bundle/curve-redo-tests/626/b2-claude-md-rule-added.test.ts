// PR #628 also added a "Pre-Sign Gate Surface Sweeps" rule to CLAUDE.md
// covering the lesson learned. Verify the rule landed in CLAUDE.md.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("CLAUDE.md gained the Pre-Sign Gate Surface Sweeps rule", () => {
  const src = readFileSync(resolve(process.cwd(), "CLAUDE.md"), "utf8");
  expect(src).toMatch(/Pre-Sign Gate Surface Sweeps/i);
});
