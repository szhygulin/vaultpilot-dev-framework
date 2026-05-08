import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

test("CLAUDE.md or AGENTS.md surfaces the advice-liability boundary", () => {
  const candidates = ["CLAUDE.md", "AGENTS.md"];
  const blobs = candidates
    .filter((p) => existsSync(join(repoRoot, p)))
    .map((p) => readFileSync(join(repoRoot, p), "utf8").toLowerCase());
  expect(blobs.length).toBeGreaterThan(0);
  const joined = blobs.join("\n");
  const hit = [
    "liability",
    "not financial advice",
    "not investment advice",
    "disclaimer",
    "responsible",
    "informational",
    "no personalized",
  ].some((needle) => joined.includes(needle));
  expect(hit).toBe(true);
});
