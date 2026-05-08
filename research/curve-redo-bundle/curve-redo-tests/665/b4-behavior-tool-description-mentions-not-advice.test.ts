import { test, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const src = join(__dirname, "..", "src");

function collect(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collect(full));
    else if (name.endsWith(".ts")) {
      try { out.push(readFileSync(full, "utf8")); } catch { /* ignore */ }
    }
  }
  return out;
}

test("some tool description string in src/ declares non-advisory nature", () => {
  const files = collect(src);
  const sawDescriptionWithDisclaimer = files.some((text) => {
    const t = text.toLowerCase();
    if (!t.includes("description")) return false;
    return [
      "not financial advice",
      "not investment advice",
      "informational",
      "educational",
      "disclaimer",
      "no personalized",
    ].some((needle) => t.includes(needle));
  });
  expect(sawDescriptionWithDisclaimer).toBe(true);
});
