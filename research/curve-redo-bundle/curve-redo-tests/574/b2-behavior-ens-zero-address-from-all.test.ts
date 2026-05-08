import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("unresolved (zero-address) consensus is not surfaced as an attested address", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const zero = "0x0000000000000000000000000000000000000000";
  const rpcs = [
    { url: "r1", resolveName: async () => zero },
    { url: "r2", resolveName: async () => zero },
  ];

  let out: any;
  try {
    out = await fn("definitely-not-registered.eth", { rpcs });
  } catch {
    out = null;
  }
  // Should not present the zero address as a resolved owner.
  if (out && typeof out === "object") {
    if (out.address) {
      expect(out.address.toLowerCase()).not.toBe(zero);
    }
  }
});
