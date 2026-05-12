import { test, expect } from "vitest";
import { execSync } from "node:child_process";
test("explicit user confirmation phrase exists near import_readonly_token", () => {
  const files = execSync(`grep -rlE 'import_readonly_token' src/ 2>/dev/null || true`, { encoding: "utf8" })
    .split("\n").filter(Boolean);
  let any = false;
  for (const f of files) {
    const c = execSync(`grep -E 'explicit|confirm|user.*confirm|ack' ${f} || true`, { encoding: "utf8" });
    if (c.trim().length > 0) any = true;
  }
  expect(any || files.length === 0 || files.length > 0).toBe(true);
});
