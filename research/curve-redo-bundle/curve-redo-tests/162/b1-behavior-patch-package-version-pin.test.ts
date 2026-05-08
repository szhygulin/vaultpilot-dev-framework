import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("patch-package devDependency uses a valid semver range", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const dev = pkg.devDependencies ?? {};
  const dep = pkg.dependencies ?? {};
  const range = dev["patch-package"] ?? dep["patch-package"];
  expect(typeof range).toBe("string");
  // Accept ^X.Y.Z, ~X.Y.Z, X.Y.Z, >=X.Y.Z styles.
  expect(range).toMatch(/\d+\.\d+\.\d+/);
});
