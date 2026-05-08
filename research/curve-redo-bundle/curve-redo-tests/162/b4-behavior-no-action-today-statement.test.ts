import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

function collectDocs(): string {
  let blob = "";
  for (const rel of ["SECURITY.md", "README.md", "ROADMAP.md"]) {
    const full = path.join(repoRoot, rel);
    if (fs.existsSync(full)) blob += fs.readFileSync(full, "utf8") + "\n";
  }
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

test("docs capture 'no action today' decision", () => {
  const blob = collectDocs();
  expect(blob.toLowerCase()).toMatch(/no action|tracking only|do not patch|will not.*patch/);
});
