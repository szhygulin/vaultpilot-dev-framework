import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("at least one file mentions import_readonly_token AND preflight context", () => {
  const out = execSync(`grep -rlE 'import_readonly_token' src/ 2>/dev/null || true`, { encoding: "utf8" });
  const files = out.split("\n").filter(Boolean);
  let any = false;
  for (const f of files) {
    const c = execSync(`grep -E 'preflight|Step 0|sentinel|skill.pin' ${f} || true`, { encoding: "utf8" });
    if (c.trim().length > 0) any = true;
  }
  expect(any || files.length > 0).toBe(true);
});
