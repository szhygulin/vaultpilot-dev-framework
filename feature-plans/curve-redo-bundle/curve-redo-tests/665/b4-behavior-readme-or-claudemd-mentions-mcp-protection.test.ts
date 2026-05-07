import { test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

test("agent-facing doc (CLAUDE.md/AGENTS.md/README.md) explains the liability boundary", () => {
  const docs = ["CLAUDE.md", "AGENTS.md", "README.md"]
    .filter((p) => existsSync(join(repoRoot, p)))
    .map((p) => readFileSync(join(repoRoot, p), "utf8").toLowerCase());
  expect(docs.length).toBeGreaterThan(0);
  const hit = docs.some((t) => {
    const a = t.includes("liability") || t.includes("responsible") || t.includes("liable") || t.includes("accountab");
    const b = t.includes("agent") || t.includes("caller") || t.includes("client") || t.includes("mcp") || t.includes("vaultpilot");
    const c = t.includes("advice") || t.includes("advisor") || t.includes("financial") || t.includes("disclaimer");
    return a && b && c;
  });
  expect(hit).toBe(true);
});
