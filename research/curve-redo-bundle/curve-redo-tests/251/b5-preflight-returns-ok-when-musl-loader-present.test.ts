import { test } from "node:test";
import assert from "node:assert/strict";

test("preflightSdkBinary returns ok when musl loader IS present", async () => {
  const mod: any = await import("./sdkBinary.js");
  const result = mod.preflightSdkBinary({
    envClaudeBinPath: () => undefined,
    platform: () => "linux",
    resolveMuslBin: () => "/musl/bin",
    resolveGlibcBin: () => "/glibc/bin",
    fileExists: () => true,
  });
  assert.equal(result.ok, true);
});
