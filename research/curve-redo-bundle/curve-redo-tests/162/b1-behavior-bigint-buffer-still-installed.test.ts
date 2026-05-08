import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("package-lock.json still resolves bigint-buffer (we kept all Solana SDKs)", () => {
  const lock = readFileSync(join(ROOT, "package-lock.json"), "utf8");
  expect(lock).toMatch(/bigint-buffer/);
});
