import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "..");

function collectDocs(): string {
  let blob = "";
  const candidates = ["SECURITY.md", "README.md", "ROADMAP.md"];
  for (const rel of candidates) {
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

test("@solana/spl-token named in advisory dep tree", () => {
  const blob = collectDocs();
  expect(blob).toMatch(/@solana\/spl-token/);
});
