import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

test("package.json scripts.postinstall mentions patch-package", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  expect(pkg.scripts).toBeDefined();
  expect(typeof pkg.scripts.postinstall).toBe("string");
  expect(pkg.scripts.postinstall).toMatch(/patch-package/);
});
