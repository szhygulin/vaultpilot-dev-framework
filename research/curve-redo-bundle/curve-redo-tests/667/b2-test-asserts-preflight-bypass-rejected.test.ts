import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("test suite has an assertion that bypass-of-preflight is rejected", () => {
  const out = execSync(
    `grep -rlE 'import.readonly.token|importReadonlyToken' test/ 2>/dev/null || true`,
    { encoding: "utf8" },
  );
  const files = out.trim().split("\n").filter(Boolean);
  let rejectAssertion = false;
  for (const f of files) {
    const src = require("node:fs").readFileSync(f, "utf8");
    if (/reject|refus|throw|expect.*toThrow|toBe.*false|step.0|preflight|sentinel/i.test(src)) {
      rejectAssertion = true;
      break;
    }
  }
  expect(rejectAssertion).toBe(true);
});
