import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

test("server.json carries a disclaimer/neutrality marker", () => {
  const path = join(repoRoot, "server.json");
  expect(existsSync(path)).toBe(true);
  const text = readFileSync(path, "utf8").toLowerCase();
  const hit = [
    "not financial advice",
    "not investment advice",
    "informational",
    "educational",
    "disclaimer",
    "no personalized",
  ].some((needle) => text.includes(needle));
  expect(hit).toBe(true);
});
