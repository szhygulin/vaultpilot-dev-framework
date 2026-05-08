import { test, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

function collect(dir: string, exts: string[]): string {
  let out = "";
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "test" || name === "test-results" || name === "dist" || name === "build") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out += collect(full, exts);
    else if (exts.some((e) => name.endsWith(e))) {
      try { out += "\n" + readFileSync(full, "utf8"); } catch { /* ignore */ }
    }
  }
  return out;
}

test("at least two distinct disclaimer/neutrality mitigations are present", () => {
  const blob = collect(repoRoot, [".ts", ".md", ".json"]).toLowerCase();
  const mitigations = [
    "not financial advice",
    "not investment advice",
    "informational",
    "educational",
    "no personalized",
    "licensed",
    "not a recommendation",
    "liability",
    "neutral",
    "disclaimer",
  ];
  const distinct = mitigations.filter((m) => blob.includes(m)).length;
  expect(distinct).toBeGreaterThanOrEqual(2);
});
