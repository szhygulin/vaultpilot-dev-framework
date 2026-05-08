import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

function collectDocs(): string {
  let blob = "";
  const sec = path.join(repoRoot, "SECURITY.md");
  if (fs.existsSync(sec)) blob += fs.readFileSync(sec, "utf8") + "\n";
  const docsDir = path.join(repoRoot, "docs");
  if (fs.existsSync(docsDir)) {
    for (const f of fs.readdirSync(docsDir)) {
      const full = path.join(docsDir, f);
      if (fs.statSync(full).isFile()) {
        blob += fs.readFileSync(full, "utf8") + "\n";
      }
    }
  }
  return blob;
}

test("docs reference bigint-buffer in advisory context", () => {
  const blob = collectDocs();
  expect(blob).toMatch(/bigint-buffer/);
  // and is mentioned alongside the advisory or vulnerability discussion (not just patch metadata)
  expect(blob.toLowerCase()).toMatch(/(advisor|vulnerab|overflow|tobigintle|cve|ghsa)/);
});
