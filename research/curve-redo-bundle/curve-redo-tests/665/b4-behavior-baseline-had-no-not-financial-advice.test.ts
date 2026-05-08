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

test("both 'financial' and 'advice' co-occur within close proximity in some shipped file", () => {
  const blobs = collect(repoRoot, [".ts", ".md", ".json"]);
  const proximityHit = blobs.some((text) => {
    const t = text.toLowerCase();
    // Look for 'advice' within 80 chars of 'financial' or 'investment'.
    const re = /(financial|investment)[\s\S]{0,80}advice|advice[\s\S]{0,80}(financial|investment)/;
    return re.test(t);
  });
  expect(proximityHit).toBe(true);
});
