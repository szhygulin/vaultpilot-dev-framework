import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("patch body references toBigIntLE", () => {
  const body = readFileSync(
    join(ROOT, "patches", "bigint-buffer+1.1.5.patch"),
    "utf8",
  );
  expect(body.toLowerCase()).toContain("tobigintle");
});
