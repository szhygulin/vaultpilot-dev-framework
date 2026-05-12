import { test, expect } from "vitest";
import { execSync } from "node:child_process";

test("import_readonly_token's source area mentions preflight, Step 0, or sentinel", () => {
  // Look for files in src/ that mention BOTH import_readonly_token AND a
  // preflight binding indicator.
  const out = execSync(
    `grep -rlE 'import.readonly.token|importReadonlyToken' src/ 2>/dev/null || true`,
    { encoding: "utf8" },
  );
  const files = out.trim().split("\n").filter(Boolean);
  let bindingFound = false;
  for (const f of files) {
    const src = require("node:fs").readFileSync(f, "utf8");
    if (/preflight|Step 0|sentinel|step-0|Inv #4|Inv #7|presence.check|contact.decoration/i.test(src)) {
      bindingFound = true;
      break;
    }
  }
  expect(bindingFound).toBe(true);
});
