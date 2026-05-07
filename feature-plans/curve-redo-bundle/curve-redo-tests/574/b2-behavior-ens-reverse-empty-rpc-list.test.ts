import { test, expect } from "vitest";
import * as ens from "../src/modules/ens/index.js";

test("reverseResolveEns with empty RPC list refuses", async () => {
  const fn = (ens as any).reverseResolveEns ?? (ens as any).reverseResolveEnsWithConsensus;
  expect(typeof fn).toBe("function");

  let out: any;
  let threw = false;
  try {
    out = await fn("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", { rpcs: [] });
  } catch {
    threw = true;
  }
  if (!threw) {
    expect(out?.name).toBeFalsy();
    expect(out?.attested === true).toBe(false);
  }
});
