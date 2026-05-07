import { test, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

test("@solana/spl-token remains a transitive dep (no audit fix --force surgery)", () => {
  const lockPath = path.resolve(process.cwd(), "package-lock.json");
  expect(fs.existsSync(lockPath)).toBe(true);
  const lock = fs.readFileSync(lockPath, "utf-8");
  // The boundary case: at least one of the named SDKs must still resolve.
  // If audit fix --force ran, these would be dropped.
  expect(lock).toMatch(/@solana\/spl-token/);
});
