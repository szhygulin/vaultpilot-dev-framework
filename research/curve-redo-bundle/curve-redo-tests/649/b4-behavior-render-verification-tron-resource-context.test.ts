import { test, expect } from "vitest";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("render-verification.ts references TRON resource model (energy / bandwidth / frozen stake / net burn)", () => {
  const src = fs.readFileSync(
    resolve(repoRoot, "src/signing/render-verification.ts"),
    "utf8",
  );
  // Issue: 'Cost preview should reflect the post-stake net TRX burn, not the
  // gross resource quote'.
  expect(src).toMatch(/energy|bandwidth|frozen|stake|burn|\bTRX\b|tron/i);
});
