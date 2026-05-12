// Self-documenting fix — the code comment near the ack should reference
// the issue / its mechanism (classifyDestination / non-protocol target).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("rationale comment near the ack references classifyDestination or non-protocol concept", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  expect(ackIdx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, ackIdx - 800), ackIdx);
  expect(window).toMatch(/classifyDestination|non-protocol|allowlist|catch-all|unknown destination|destination gate/i);
});
