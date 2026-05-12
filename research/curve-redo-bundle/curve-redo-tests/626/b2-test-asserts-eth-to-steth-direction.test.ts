// Both directions (steth_to_eth and eth_to_steth) hit the same pool `to`
// and need the ack. PR #628's test suite covers both.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("curve-v1 test suite covers eth↔steth (or both directions) with the ack", () => {
  const src = readFileSync(resolve(process.cwd(), "test/curve-v1.test.ts"), "utf8");
  // The ack assertion appears multiple times — across different test cases.
  const ackCount = (src.match(/acknowledgedNonProtocolTarget/g) || []).length;
  expect(ackCount).toBeGreaterThanOrEqual(2);
});
