import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("acknowledgedNonProtocolTarget assignment is boolean true, not string", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const m = src.match(/acknowledgedNonProtocolTarget\s*[:=]\s*([a-zA-Z"']+)/);
  if (m) expect(m[1]).toMatch(/^true$/);
});
