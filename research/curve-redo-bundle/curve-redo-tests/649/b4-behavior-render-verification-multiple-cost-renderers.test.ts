import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts declares more than one cost-preview render variant", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  // Issue: 'Add chain-specific render variants in src/signing/render-verification.ts.'
  // Baseline has a single renderCostPreviewBlock; after, there must be ≥ 2
  // declarations whose name carries 'Cost' (one per chain family or a clear set).
  const decls = src.match(/(?:function|const|let)\s+\w*[Cc]ost\w*/g) || [];
  expect(decls.length).toBeGreaterThanOrEqual(2);
});
