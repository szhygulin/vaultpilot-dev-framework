import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("patch-package is in devDependencies", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const dev = pkg.devDependencies ?? {};
  expect(
    typeof dev["patch-package"] === "string" ||
      typeof (pkg.dependencies ?? {})["patch-package"] === "string",
  ).toBe(true);
});
