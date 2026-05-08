import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

test("GHSA-3gc7-fjrx-p6mg appears in a structured tracking surface", () => {
  const candidates: string[] = [];
  for (const f of walk(repoRoot)) {
    if (f.includes(`${path.sep}node_modules${path.sep}`)) continue;
    if (
      f.endsWith(".md") ||
      f.endsWith(".json") ||
      f.endsWith(".yml") ||
      f.endsWith(".yaml") ||
      f.endsWith(".toml")
    ) {
      candidates.push(f);
    }
  }
  const hits = candidates.filter((p) =>
    fs.readFileSync(p, "utf8").includes("GHSA-3gc7-fjrx-p6mg"),
  );
  expect(hits.length).toBeGreaterThan(0);
});
