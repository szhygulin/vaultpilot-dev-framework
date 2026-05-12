// The fix MUST NOT gate the new flag on a user-passed ack parameter
// (issue #626 chose option-2 = stamp from server validation, not option-1).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("acknowledgedNonProtocolTarget is not assigned from a `p.acknowledge*` user input", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  // Match the assignment line and verify it's literal `true` or a variable
  // not named like `p.acknowledge*`.
  const m = src.match(/acknowledgedNonProtocolTarget\s*[:=]\s*([^\s,;}]+)/);
  if (m) {
    expect(m[1]).not.toMatch(/^p\.acknowledge/);
  }
});
