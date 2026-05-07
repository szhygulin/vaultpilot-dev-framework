import { test, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..");

function collect(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "test" || name === "test-results" || name === "dist" || name === "build") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collect(full, exts));
    else if (exts.some((e) => name.endsWith(e))) {
      try { out.push(readFileSync(full, "utf8")); } catch { /* ignore */ }
    }
  }
  return out;
}

test("some shipped file states liability rests with the agent, not vaultpilot-mcp", () => {
  const blobs = collect(repoRoot, [".ts", ".md", ".json"]).join("\n").toLowerCase();
  const phrases = [
    "liability",
    "responsible",
    "responsibility",
  ];
  const mentions = [
    "agent",
    "caller",
    "client",
    "calling",
  ];
  const phraseHit = phrases.some((p) => blobs.includes(p));
  const mentionHit = mentions.some((m) => blobs.includes(m));
  expect(phraseHit && mentionHit).toBe(true);
});
