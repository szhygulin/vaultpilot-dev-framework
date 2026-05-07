import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("bigint-buffer patch has non-trivial body content", () => {
  const body = readFileSync(
    join(ROOT, "patches", "bigint-buffer+1.1.5.patch"),
    "utf8",
  );
  // A unified diff with a real change is at least a few hundred chars.
  expect(body.length).toBeGreaterThan(200);
  expect(body.split("\n").length).toBeGreaterThan(8);
});
