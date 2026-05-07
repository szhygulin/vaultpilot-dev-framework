import { describe, it, expect } from "vitest";

describe("ENS resolver public API exports both directions", () => {
  it("exports a forward and reverse ENS resolution function", async () => {
    const mod: any = await import("../src/contacts/resolver.js");
    const fwd =
      mod.resolveEnsName ?? mod.resolveEns ?? mod.resolveName ?? mod.default?.resolveEnsName;
    const rev =
      mod.reverseResolveEns ?? mod.reverseResolveEnsName ?? mod.reverseEns ?? mod.default?.reverseResolveEns;
    expect(typeof fwd).toBe("function");
    expect(typeof rev).toBe("function");
    // Functions should accept at minimum the canonical input plus options object.
    expect(fwd.length).toBeGreaterThanOrEqual(1);
    expect(rev.length).toBeGreaterThanOrEqual(1);
  });
});
