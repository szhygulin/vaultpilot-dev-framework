import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("patches/bigint-buffer+1.1.5.patch exists at repo root", () => {
  expect(existsSync(join(ROOT, "patches", "bigint-buffer+1.1.5.patch"))).toBe(true);
});
