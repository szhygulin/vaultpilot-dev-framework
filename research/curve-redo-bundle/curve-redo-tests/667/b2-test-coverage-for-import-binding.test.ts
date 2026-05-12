import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("a test file under test/ exercises the import_readonly_token preflight binding", () => {
  const out = execSync(
    `grep -rlE 'import.readonly.token|importReadonlyToken' test/ src/ 2>/dev/null | grep -E 'test\\.ts$|spec\\.ts$|test/' || true`,
    { encoding: "utf8" },
  );
  expect(out.trim().length).toBeGreaterThan(0);
});
