// Defensive: PR #628 settled on the spelling acknowledgedNonProtocolTarget
// (American spelling, two-d acknowledged). Verify that exact identifier.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("ack identifier uses canonical spelling acknowledgedNonProtocolTarget", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  expect(src).toMatch(/\backnowledgedNonProtocolTarget\b/);
});
