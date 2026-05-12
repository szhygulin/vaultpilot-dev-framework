// The PR added an 8-line // comment block above the ack. Verify the
// comment region is multi-line (not a one-line dismissive comment).
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("rationale comment block above ack spans multiple lines", () => {
  const src = readFileSync(resolve(process.cwd(), "src/modules/curve/actions.ts"), "utf8");
  const ackIdx = src.indexOf("acknowledgedNonProtocolTarget");
  expect(ackIdx).toBeGreaterThan(-1);
  const window = src.slice(Math.max(0, ackIdx - 1500), ackIdx);
  const commentLines = (window.match(/^\s*\/\//gm) || []).length;
  // Need at least 3 lines of // comment near the ack.
  expect(commentLines).toBeGreaterThanOrEqual(3);
});
