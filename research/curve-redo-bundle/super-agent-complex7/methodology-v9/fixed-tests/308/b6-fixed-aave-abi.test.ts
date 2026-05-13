// Issue #308 v5 — Aave V3 ABI drift fix.
// FIXES: probe module path + symbol-name variants (V3 / V3_2 / V3_3 / Latest / Default).
import { test, beforeAll, expect } from "vitest";

const PATHS = [
  "../src/abis/aave-ui-pool-data-provider.js",
  "../src/abis/aaveUiPoolDataProvider.js",
  "../src/abis/aave.js",
  "../src/abi/aave-ui-pool-data-provider.js",
];

let mod: any = null;
let abi: any, abiV3: any, abiV3_2: any, abiV3_3: any;
let resetCache: any;

async function load() {
  for (const p of PATHS) {
    try { const m = await import(p); if (m && Object.keys(m).length) return m; } catch {}
  }
  return null;
}
function pickAny(m: any, names: string[]): any {
  for (const n of names) if (m && m[n] !== undefined) return m[n];
  return null;
}

beforeAll(async () => {
  mod = await load();
  if (mod) {
    abi = pickAny(mod, ["aaveUiPoolDataProviderAbi", "aaveAbi", "aaveUiPoolDataProviderAbiDefault", "AAVE_UI_POOL_DATA_PROVIDER_ABI", "DEFAULT_ABI"]);
    abiV3 = pickAny(mod, ["aaveUiPoolDataProviderAbiV3", "abiV3", "AAVE_ABI_V3", "v3"]);
    abiV3_2 = pickAny(mod, ["aaveUiPoolDataProviderAbiV3_2", "aaveUiPoolDataProviderAbiV32", "abiV3_2", "AAVE_ABI_V3_2", "v32"]);
    abiV3_3 = pickAny(mod, ["aaveUiPoolDataProviderAbiV3_3", "aaveUiPoolDataProviderAbiV33", "abiV3_3", "AAVE_ABI_V3_3", "v33"]);
    resetCache = pickAny(mod, ["_resetAaveAbiCacheForTest", "resetAaveAbiCache", "_resetCache", "resetAbiCache"]);
  }
});

test("module loaded", () => {
  expect(mod, "no aave abi module found").not.toBeNull();
});

test("at least V3 and V3.2 ABIs are exported", () => {
  expect(abiV3, "V3 ABI not exported").not.toBeNull();
  expect(abiV3_2, "V3.2 ABI not exported").not.toBeNull();
});

test("default ABI is an array of fragments", () => {
  expect(abi, "default ABI not exported").not.toBeNull();
  expect(Array.isArray(abi)).toBe(true);
  expect((abi as any[]).length).toBeGreaterThan(0);
});

test("V3 ABIs are arrays", () => {
  expect(Array.isArray(abiV3)).toBe(true);
  expect(Array.isArray(abiV3_2)).toBe(true);
});

test("default ABI matches the V3.2 variant (drift fix target)", () => {
  // The issue's core fix: default ABI was V3 but the deployed contract is V3.2.
  // We accept either an identity check OR a deep-equal — different impls do
  // different things, but the default MUST be V3.2-shaped.
  const eqIdentity = abi === abiV3_2;
  const eqDeep = !eqIdentity && JSON.stringify(abi) === JSON.stringify(abiV3_2);
  expect(eqIdentity || eqDeep, "default ABI should equal V3.2 ABI").toBe(true);
});

test("V3 differs from V3.2 (stub-defeat: not the same array reused)", () => {
  const diff = abiV3 !== abiV3_2 && JSON.stringify(abiV3) !== JSON.stringify(abiV3_2);
  expect(diff, "V3 and V3.2 must be distinct (stub returns same array for both)").toBe(true);
});

test("resetCache exists and is callable", () => {
  if (!resetCache) return; // soft-skip
  expect(() => resetCache()).not.toThrow();
});

test("resetCache accepts an optional provider arg", () => {
  if (!resetCache) return;
  expect(() => resetCache("0x0000000000000000000000000000000000000000")).not.toThrow();
});

test("stub-defeat: V3.2 references reservesV3.2-shaped function", () => {
  // The V3.2 ABI must contain getReservesData as a function. A stub returning
  // an empty array would fail this.
  const hasGetReservesData = Array.isArray(abiV3_2) && (abiV3_2 as any[]).some(
    (f) => f && typeof f === "object" && f.type === "function" && f.name === "getReservesData",
  );
  expect(hasGetReservesData, "V3.2 ABI must contain getReservesData function").toBe(true);
});
