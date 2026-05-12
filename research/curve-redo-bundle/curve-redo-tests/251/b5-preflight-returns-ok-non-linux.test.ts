import { test } from "node:test";
import assert from "node:assert/strict";

test("preflightSdkBinary returns ok:true on non-linux platforms", async () => {
  const mod: any = await import("./sdkBinary.js");
  for (const p of ["darwin", "win32"] as const) {
    const result = mod.preflightSdkBinary({
      envClaudeBinPath: () => undefined,
      platform: () => p,
      resolveMuslBin: () => "/musl/bin",
      resolveGlibcBin: () => "/glibc/bin",
      fileExists: () => false,
    });
    assert.equal(result.ok, true, `expected ok on ${p}`);
  }
});
