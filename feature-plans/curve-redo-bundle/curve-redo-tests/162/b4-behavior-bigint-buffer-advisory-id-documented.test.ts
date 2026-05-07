import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

function readAllTrackingSurfaces(): string {
  const files: string[] = [];
  const tryAdd = (rel: string) => {
    const full = path.join(repoRoot, rel);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      files.push(fs.readFileSync(full, "utf8"));
    }
  };
  tryAdd("SECURITY.md");
  tryAdd("README.md");
  tryAdd("AGENTS.md");
  tryAdd("CLAUDE.md");
  tryAdd("package.json");
  const docsDir = path.join(repoRoot, "docs");
  if (fs.existsSync(docsDir)) {
    for (const entry of fs.readdirSync(docsDir, { withFileTypes: true })) {
      if (entry.isFile()) {
        files.push(
          fs.readFileSync(path.join(docsDir, entry.name), "utf8"),
        );
      }
    }
  }
  return files.join("\n");
}

test("GHSA-3gc7-fjrx-p6mg is referenced in tracked documentation", () => {
  const blob = readAllTrackingSurfaces();
  expect(blob).toMatch(/GHSA-3gc7-fjrx-p6mg/);
});
