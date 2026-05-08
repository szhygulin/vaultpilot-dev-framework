import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("two divergent RPCs cause refusal — no address is returned", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  const honest = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
  const attacker = "0x000000000000000000000000000000000000dEaD";
  const rpcs = [
    { url: "https://honest", resolveName: async () => honest },
    { url: "https://attacker", resolveName: async () => attacker },
  ];

  let threw = false;
  let out: any;
  try {
    out = await fn("vitalik.eth", { rpcs });
  } catch {
    threw = true;
  }

  if (threw) {
    expect(threw).toBe(true);
  } else {
    // If it didn't throw, the response must NOT carry the attacker address as a resolved value.
    const flat = JSON.stringify(out ?? {}).toLowerCase();
    expect(flat).not.toContain(attacker.toLowerCase());
    expect(flat).not.toContain(honest.toLowerCase());
  }
});
