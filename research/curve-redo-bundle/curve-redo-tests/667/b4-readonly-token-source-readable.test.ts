import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("at least one src file contains import_readonly_token or importReadonlyToken (registration or impl)", () => {
  const out = execSync(`grep -rIlE 'import_readonly_token|importReadonlyToken' src/ 2>/dev/null || true`, { encoding: "utf8" });
  expect(out.split("\n").filter(Boolean).length).toBeGreaterThan(0);
});
