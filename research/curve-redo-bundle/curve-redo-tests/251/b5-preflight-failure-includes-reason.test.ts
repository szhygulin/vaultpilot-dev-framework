import { test } from "node:test";
import assert from "node:assert/strict";

test("preflightSdkBinary failure result includes reason string", async () => {
  const mod: any = await import("./sdkBinary.js");
  const result = mod.preflightSdkBinary({
    envClaudeBinPath: () => undefined,
    platform: () => "linux",
    resolveMuslBin: () => "/musl/bin",
    resolveGlibcBin: () => "/glibc/bin",
    fileExists: () => false,
  });
  if (!result.ok) {
    assert.equal(typeof result.reason, "string");
    assert.ok(result.reason.length > 0);
  }
});
