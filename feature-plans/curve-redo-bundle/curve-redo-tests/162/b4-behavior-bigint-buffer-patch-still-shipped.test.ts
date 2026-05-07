import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

test("bigint-buffer patch file is preserved at canonical path", () => {
  const patch = path.join(repoRoot, "patches", "bigint-buffer+1.1.5.patch");
  expect(fs.existsSync(patch)).toBe(true);
  // Make sure the doc system actually references the patch path so future
  // readers know the local mitigation applies.
  let blob = "";
  for (const rel of ["SECURITY.md", "README.md"]) {
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
  expect(blob).toMatch(/patches\/bigint-buffer\+?1\.1\.5\.patch|bigint-buffer\+1\.1\.5\.patch/);
});
