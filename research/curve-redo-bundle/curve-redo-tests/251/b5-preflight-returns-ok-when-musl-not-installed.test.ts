import { test } from "node:test";
import assert from "node:assert/strict";

test("preflightSdkBinary returns ok when musl artifact is not installed", async () => {
  const mod: any = await import("./sdkBinary.js");
  const result = mod.preflightSdkBinary({
    envClaudeBinPath: () => undefined,
    platform: () => "linux",
    resolveMuslBin: () => null,
    resolveGlibcBin: () => "/glibc/bin",
    fileExists: () => false,
  });
  assert.equal(result.ok, true);
});
