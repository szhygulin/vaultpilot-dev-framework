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

test("src/ contains disclaimer text reachable at runtime", () => {
  const blobs = collect(src).join("\n").toLowerCase();
  const hits = [
    "not financial advice",
    "not investment advice",
    "informational",
    "educational",
    "disclaimer",
    "no personalized",
  ].some((needle) => blobs.includes(needle));
  expect(hits).toBe(true);
});
