import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UTILITY_CALIBRATION_ANCHOR,
  UTILITY_CALIBRATION_BANDS,
  indentCalibration,
} from "./utilityCalibration.js";

test("UTILITY_CALIBRATION_ANCHOR contains all four bands", () => {
  assert.match(UTILITY_CALIBRATION_ANCHOR, /0\.0–0\.2/);
  assert.match(UTILITY_CALIBRATION_ANCHOR, /0\.3–0\.5/);
  assert.match(UTILITY_CALIBRATION_ANCHOR, /0\.6–0\.8/);
  assert.match(UTILITY_CALIBRATION_ANCHOR, /0\.9–1\.0/);
});

test("UTILITY_CALIBRATION_BANDS lists all four bands with monotonically increasing boundaries", () => {
  assert.equal(UTILITY_CALIBRATION_BANDS.length, 4);
  for (let i = 1; i < UTILITY_CALIBRATION_BANDS.length; i++) {
    assert.ok(UTILITY_CALIBRATION_BANDS[i].low > UTILITY_CALIBRATION_BANDS[i - 1].low);
    assert.ok(UTILITY_CALIBRATION_BANDS[i].high > UTILITY_CALIBRATION_BANDS[i - 1].high);
  }
});

test("indentCalibration applies the prefix to every line", () => {
  const out = indentCalibration("  - ");
  const lines = out.split("\n");
  assert.equal(lines.length, 4);
  for (const line of lines) {
    assert.ok(line.startsWith("  - "), `line missing prefix: ${line}`);
  }
});

test("indentCalibration with empty prefix returns the anchor unchanged", () => {
  assert.equal(indentCalibration(""), UTILITY_CALIBRATION_ANCHOR);
});
