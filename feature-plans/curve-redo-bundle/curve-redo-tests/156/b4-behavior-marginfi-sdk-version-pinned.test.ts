import { test, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";

test("the marginfi-client-v2 dependency reflects the upstream version line", async () => {
  const pkgRaw = await fs.readFile(path.resolve(__dirname, "..", "package.json"), "utf8");
  const pkg = JSON.parse(pkgRaw) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const dep =
    pkg.dependencies?.["@mrgnlabs/marginfi-client-v2"] ??
    pkg.devDependencies?.["@mrgnlabs/marginfi-client-v2"];
  expect(dep).toBeDefined();
  // Issue body says we're tracking against 6.4.1 — pin or caret accepted.
  expect(String(dep)).toMatch(/6\.4\.1/);
});
