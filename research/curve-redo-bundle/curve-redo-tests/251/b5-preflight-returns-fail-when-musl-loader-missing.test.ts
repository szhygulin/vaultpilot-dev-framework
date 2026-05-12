import { test } from "node:test";
import assert from "node:assert/strict";

test("preflightSdkBinary fails when musl bin present but loader absent", async () => {
  const mod: any = await import("./sdkBinary.js");
  const result = mod.preflightSdkBinary({
    envClaudeBinPath: () => undefined,
    platform: () => "linux",
    resolveMuslBin: () => "/musl/bin",
    resolveGlibcBin: () => "/glibc/bin",
    fileExists: () => false, // loader not present
  });
  assert.equal(result.ok, false);
});
