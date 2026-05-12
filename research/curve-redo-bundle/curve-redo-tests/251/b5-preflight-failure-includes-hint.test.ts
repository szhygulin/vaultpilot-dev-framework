import { test } from "node:test";
import assert from "node:assert/strict";

test("preflightSdkBinary failure result includes hint string", async () => {
  const mod: any = await import("./sdkBinary.js");
  const result = mod.preflightSdkBinary({
    envClaudeBinPath: () => undefined,
    platform: () => "linux",
    resolveMuslBin: () => "/musl/bin",
    resolveGlibcBin: () => "/glibc/bin",
    fileExists: () => false,
  });
  if (!result.ok) {
    assert.equal(typeof result.hint, "string");
    assert.ok(result.hint.length > 0);
  }
});
