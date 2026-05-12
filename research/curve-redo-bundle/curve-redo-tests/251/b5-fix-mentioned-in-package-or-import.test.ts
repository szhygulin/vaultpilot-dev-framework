import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

test("if detect-libc dep adopted, declared in package.json", () => {
  const src = readFileSync(resolve(process.cwd(), "src/agent/sdkBinary.ts"), "utf8");
  if (/detect-libc/.test(src)) {
    const pkg = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    );
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    assert.ok(deps["detect-libc"], "detect-libc imported but not declared");
  } else {
    assert.ok(true);
  }
});
