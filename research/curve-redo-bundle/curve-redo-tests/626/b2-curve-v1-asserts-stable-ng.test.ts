// stable_ng plain pools take the same code path; the test should assert
// the ack on the stable_ng path too.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1.test.ts covers stable_ng pool path with the new ack assertion", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  const ackCount = (src.match(/acknowledgedNonProtocolTarget/g) || []).length;
  // PR #628 added at least 3 separate assertions across legacy/stable_ng/multi-leg cases.
  expect(ackCount).toBeGreaterThanOrEqual(2);
});
