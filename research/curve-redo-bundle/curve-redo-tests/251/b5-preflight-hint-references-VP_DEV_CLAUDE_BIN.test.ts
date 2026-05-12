import { test } from "node:test";
import assert from "node:assert/strict";

test("preflight hint mentions VP_DEV_CLAUDE_BIN as a fix path", async () => {
  const mod: any = await import("./sdkBinary.js");
  const result = mod.preflightSdkBinary({
    envClaudeBinPath: () => undefined,
    platform: () => "linux",
    resolveMuslBin: () => "/musl/bin",
    resolveGlibcBin: () => "/glibc/bin",
    fileExists: () => false,
  });
  if (!result.ok) {
    assert.match(result.hint, /VP_DEV_CLAUDE_BIN/);
  }
});
