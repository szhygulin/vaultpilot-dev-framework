import { test, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function collectAdvisoryDocs(): string {
  const candidates = [
    "SECURITY.md",
    "docs/security-advisories.md",
    "docs/advisories.md",
    "docs/advisories/bigint-buffer.md",
    "docs/advisories/ghsa-3gc7-fjrx-p6mg.md",
    "docs/security/bigint-buffer.md",
    "docs/security/advisories.md",
  ];
  let combined = "";
  for (const c of candidates) {
    const full = path.resolve(__dirname, "..", c);
    if (fs.existsSync(full)) combined += fs.readFileSync(full, "utf8") + "\n";
  }
  return combined;
}

test("advisory tracking doc names Kamino SDK family in the cascade", () => {
  const text = collectAdvisoryDocs();
  expect(text).toMatch(/kamino/i);
});
