import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("patch adds an added line that guards on buffer length", () => {
  const body = readFileSync(
    join(ROOT, "patches", "bigint-buffer+1.1.5.patch"),
    "utf8",
  );
  // We're asserting that ONE of the +-lines (added lines) involves either
  // `.length` validation, a `throw`, or a numeric cap. This is the shape any
  // sensible local mitigation would take.
  const addedLines = body
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const guardish = addedLines.some(
    (l) => /\.length/.test(l) || /\bthrow\b/.test(l) || /RangeError/.test(l),
  );
  expect(guardish).toBe(true);
});
