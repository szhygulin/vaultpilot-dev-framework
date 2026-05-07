import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("patch targets node_modules/bigint-buffer", () => {
  const body = readFileSync(
    join(ROOT, "patches", "bigint-buffer+1.1.5.patch"),
    "utf8",
  );
  expect(body).toMatch(/node_modules\/bigint-buffer\//);
});
