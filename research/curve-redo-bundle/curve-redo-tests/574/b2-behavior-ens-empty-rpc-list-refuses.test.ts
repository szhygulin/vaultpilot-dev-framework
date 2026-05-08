import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("resolveEnsName with empty RPC list refuses to return an address", async () => {
  const fn = (ens as any).resolveEnsName ?? (ens as any).resolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  let threw = false;
  let result: any;
  try {
    result = await fn("vitalik.eth", { rpcs: [] });
  } catch {
    threw = true;
  }

  if (threw) {
    expect(threw).toBe(true);
  } else {
    // If it didn't throw, it must NOT return a resolved address claiming attestation.
    expect(result?.address).toBeFalsy();
    expect(result?.attested === true).toBe(false);
  }
});
