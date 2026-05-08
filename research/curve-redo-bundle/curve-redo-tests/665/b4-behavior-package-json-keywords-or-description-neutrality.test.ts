import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

test("package.json description or keywords flag the not-advice positioning", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    description?: string;
    keywords?: string[];
  };
  const blob = `${pkg.description ?? ""} ${(pkg.keywords ?? []).join(" ")}`.toLowerCase();
  const hit = [
    "not financial advice",
    "not investment advice",
    "informational",
    "educational",
    "non-advisory",
    "not advice",
    "disclaimer",
  ].some((needle) => blob.includes(needle));
  expect(hit).toBe(true);
});
