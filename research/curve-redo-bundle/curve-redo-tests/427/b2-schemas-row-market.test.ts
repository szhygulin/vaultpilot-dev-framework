// Schema row market.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("b2 schemas row market", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/digest/schemas.ts"), "utf8");
  expect(src).toMatch(/HealthAlertRow[\s\S]*?market\s*:\s*string\s*\|\s*null/);
});
