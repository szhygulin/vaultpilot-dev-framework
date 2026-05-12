// Warn references issue tracker.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b1 warn mentions issues", () => {
  const src = readFileSync(resolve(process.cwd(), "src/signing/canonical-apps.ts"), "utf8");
  expect(src).toMatch(/issues so the manifest can be updated|github\.com\/szhygulin\/vaultpilot-mcp\/issues/);
});
