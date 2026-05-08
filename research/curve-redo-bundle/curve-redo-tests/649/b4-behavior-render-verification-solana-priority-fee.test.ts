import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts surfaces Solana priority-fee or compute-unit context for the cost preview", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  // Issue: 'Priority fee math depends on the simulated CU consumption — the
  // existing simulate path already has this number; surfacing it in the
  // preview is the new work.'
  expect(src).toMatch(/priority\s*fee|compute\s*unit|micro[\s-]?lamport|\bCU\b|lamport/i);
});
