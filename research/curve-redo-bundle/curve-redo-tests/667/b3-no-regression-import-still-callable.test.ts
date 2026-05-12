import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("import_readonly_token tool symbol is still defined (no accidental delete)", () => {
  const out = execSync(
    `grep -rlE 'import.readonly.token|importReadonlyToken' src/ 2>/dev/null || true`,
    { encoding: "utf8" },
  );
  expect(out.trim().length).toBeGreaterThan(0);
});
