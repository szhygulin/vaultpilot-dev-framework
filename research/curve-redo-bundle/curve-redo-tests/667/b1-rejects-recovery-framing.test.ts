// Issue's suggested fix: "Reject installs whose name/description fields
// claim 'recovery' framing without explicit user confirmation."
import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("import_readonly_token source has recovery-framing guard or warning", () => {
  const out = execSync(
    `grep -rlE 'import.readonly.token|importReadonlyToken' src/ 2>/dev/null || true`,
    { encoding: "utf8" },
  );
  const files = out.trim().split("\n").filter(Boolean);
  let guardFound = false;
  for (const f of files) {
    const src = require("node:fs").readFileSync(f, "utf8");
    if (/recovery|onboarding|wallet.import.*confirm|acknowledged.*recovery/i.test(src)) {
      guardFound = true;
      break;
    }
  }
  expect(guardFound).toBe(true);
});
