import { test } from "node:test";
import assert from "node:assert/strict";

test("preflightSdkBinary returns ok:true when env override present (injected)", async () => {
  const mod: any = await import("./sdkBinary.js");
  const result = mod.preflightSdkBinary({
    envClaudeBinPath: () => "/some/path/claude",
    platform: () => "linux",
    resolveMuslBin: () => "/musl/bin",
    resolveGlibcBin: () => "/glibc/bin",
    fileExists: () => false,
  });
  assert.equal(result.ok, true);
});
