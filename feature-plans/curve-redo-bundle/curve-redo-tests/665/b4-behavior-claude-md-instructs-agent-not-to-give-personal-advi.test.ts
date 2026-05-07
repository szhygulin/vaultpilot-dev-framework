import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

test("CLAUDE.md or AGENTS.md instructs the agent against issuing personal advice", () => {
  const docs = ["CLAUDE.md", "AGENTS.md"]
    .filter((p) => existsSync(join(repoRoot, p)))
    .map((p) => readFileSync(join(repoRoot, p), "utf8").toLowerCase());
  expect(docs.length).toBeGreaterThan(0);
  const joined = docs.join("\n");
  const hit = [
    "not financial advice",
    "not investment advice",
    "do not provide",
    "do not give",
    "must not",
    "shall not",
    "no personalized",
    "no personal advice",
    "informational",
    "educational",
  ].some((needle) => joined.includes(needle));
  expect(hit).toBe(true);
});
