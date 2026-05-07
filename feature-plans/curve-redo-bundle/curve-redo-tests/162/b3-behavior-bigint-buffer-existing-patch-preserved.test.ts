import { test, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

test("patches/bigint-buffer+1.1.5.patch is preserved (no removal of existing mitigation)", () => {
  const patchPath = path.resolve(__dirname, "..", "patches", "bigint-buffer+1.1.5.patch");
  expect(fs.existsSync(patchPath)).toBe(true);
  const stat = fs.statSync(patchPath);
  expect(stat.size).toBeGreaterThan(0);
});
