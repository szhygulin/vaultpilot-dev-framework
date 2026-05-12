import { test } from "node:test";
import assert from "node:assert/strict";

test("preflight reason mentions the musl loader path", async () => {
  const mod: any = await import("./sdkBinary.js");
  const result = mod.preflightSdkBinary({
    envClaudeBinPath: () => undefined,
    platform: () => "linux",
    resolveMuslBin: () => "/musl/bin",
    resolveGlibcBin: () => "/glibc/bin",
    fileExists: () => false,
  });
  if (!result.ok) {
    assert.match(result.reason, /ld-musl-x86_64\.so\.1|musl loader/);
  }
});
