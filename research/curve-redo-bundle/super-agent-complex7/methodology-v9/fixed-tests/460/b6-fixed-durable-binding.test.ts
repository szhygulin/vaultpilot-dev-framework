// Issue #460 v5 — Invariant #14 (durable-binding source-of-truth) tests.
// FIXES from v4 audit:
//   - Probe-dispatch the factory function (don't hardcode `makeDurableBinding`).
//   - Probe-dispatch the hint field name (try `provenanceHint` / `hint` / `description` / etc.).
//   - Accept kind-enum aliases (`compound-comet-address` vs `compound-comet` vs `compound`).
//   - Negative stub-defeat: hint for a given kind must NOT also contain ≥3 other kinds' URLs.
//
// Per-kind assertions still verify the right URL goes with the right kind — that's the actual logic.
import { test, expect, beforeAll } from "vitest";

const MODULE_PATHS = [
  "../src/security/durable-binding.js",
  "../src/security/durableBinding.js",
  "../src/security/durable_binding.js",
  "../src/security/binding.js",
  "../src/durable-binding.js",
  "../src/durableBinding.js",
];

const FACTORY_NAMES = [
  "makeDurableBinding",
  "makeDurableBindingNotes",  // 3-arg shape: (kind, source, instruction)
  "createDurableBinding",
  "buildDurableBinding",
  "renderDurableBindingSource",
  "renderDurableBinding",
  "durableBinding",
  "newDurableBinding",
];

const HINT_FIELDS = ["provenanceHint", "hint", "description", "message", "guidance", "note", "source"];

// Each kind: regex for ITS UNIQUE-to-the-kind authority signal. Broadened to
// accept "right design family" (web-UI lookup OR on-chain enum OR independent
// RPC) since the issue's actual requirement is "any external authority"; we
// only flag implementations whose hint doesn't engage with the kind's
// topical domain at all. Each regex is still distinctive to its kind so the
// negative cross-kind assertions still bite.
const URL_FOR_KIND: Record<string, RegExp> = {
  "solana-validator-vote-pubkey": /stakewiz|validators\.app|validator (directory|list|registry)/i,
  "tron-super-representative-address": /tronscan|super representative|sr (list|directory|registry)/i,
  "compound-comet-address": /compound\.finance|comet (address|table|registry)|canonical[- ]?contract/i,
  "morpho-blue-market-id": /morpho\.org|app\.morpho|on-chain morpho|morpho.*singleton|morpho.*market/i,
  "marginfi-bank-pubkey": /marginfi\.com|app\.marginfi|bank (enumeration|registry)/i,
  "uniswap-v3-lp-token-id": /uniswap\.org|app\.uniswap|ownerOf|lp[- ]?(position|nft|token)/i,
  "btc-multisig-cosigner-xpub": /backup card|paper backup|device.?backup|hardware backup|xpub.*backup/i,
  "approval-spender-address": /etherscan|on-chain.*(allowance|spender)|spender.*on-chain|get_token_allowances/i,
};

const KIND_ALIASES: Record<string, string[]> = {
  "solana-validator-vote-pubkey": ["solana-validator-vote-pubkey", "solana-validator", "solana"],
  "tron-super-representative-address": ["tron-super-representative-address", "tron-super-representative", "tron-sr", "tron"],
  "compound-comet-address": ["compound-comet-address", "compound-comet", "compound"],
  "morpho-blue-market-id": ["morpho-blue-market-id", "morpho-market", "morpho-blue", "morpho"],
  "marginfi-bank-pubkey": ["marginfi-bank-pubkey", "marginfi-bank", "marginfi"],
  "uniswap-v3-lp-token-id": ["uniswap-v3-lp-token-id", "uniswap-v3-lp-nft", "uniswap-lp", "uniswap-v3", "uniswap"],
  "btc-multisig-cosigner-xpub": ["btc-multisig-cosigner-xpub", "btc-multisig-xpub", "btc-multisig", "btc-cosigner"],
  "approval-spender-address": ["approval-spender-address", "approval-spender", "spender-address", "spender", "approval"],
};

let mod: any = null;
let factory: any = null;

async function tryLoad() {
  for (const p of MODULE_PATHS) {
    try {
      const m = await import(p);
      if (m && Object.keys(m).length > 0) return m;
    } catch {}
  }
  return null;
}

function pickFactory(m: any): any {
  for (const n of FACTORY_NAMES) {
    if (m && typeof m[n] === "function") return m[n];
  }
  // Fallback: any exported function whose first arg looks like a kind
  if (m) {
    for (const k of Object.keys(m)) {
      const v = m[k];
      if (typeof v === "function" && (v.length === 2 || v.length === 3)) return v;
    }
  }
  return null;
}

// Call factory adaptively — try (kind, id) first, then (kind, id, "") for 3-arg.
function callFactory(fn: any, kind: string, id: string): any {
  try {
    if (fn.length === 3) return fn(kind, id, "verify via external authority");
    if (fn.length === 2) return fn(kind, id);
    // Fallback: try both
    try { return fn(kind, id); } catch {}
    try { return fn(kind, id, "verify"); } catch {}
  } catch {}
  return null;
}

function extractHint(o: any): string | undefined {
  if (!o || typeof o !== "object") return undefined;
  for (const f of HINT_FIELDS) {
    if (typeof o[f] === "string" && o[f].length > 0) return o[f];
  }
  return undefined;
}

function callWithAliases(fn: any, canonical: string, id: string): { binding: any; alias: string } | null {
  for (const alias of KIND_ALIASES[canonical] || [canonical]) {
    const b = callFactory(fn, alias, id);
    if (b !== undefined && b !== null) return { binding: b, alias };
  }
  return null;
}

beforeAll(async () => {
  mod = await tryLoad();
  if (mod) factory = pickFactory(mod);
});

test("b6 module loads", async () => {
  expect(mod, "no implementation module found at expected paths").not.toBeNull();
});

test("b6 factory function present", async () => {
  expect(factory, "no factory function found on module").not.toBeNull();
});

test("b6 returns object with kind + identifier preserved", async () => {
  expect(factory).not.toBeNull();
  const r = callWithAliases(factory, "compound-comet-address", "0xCometAddr");
  expect(r, "factory rejected all compound aliases").not.toBeNull();
  // Be tolerant on field naming for identifier too
  const id = r!.binding.identifier ?? r!.binding.value ?? r!.binding.address ?? r!.binding.id;
  expect(id).toBe("0xCometAddr");
});

test("b6 identifier verbatim (full no-truncation)", async () => {
  expect(factory).not.toBeNull();
  const id = "0x" + "a".repeat(64);
  const r = callWithAliases(factory, "morpho-blue-market-id", id);
  expect(r).not.toBeNull();
  const out = r!.binding.identifier ?? r!.binding.value ?? r!.binding.id;
  expect(out).toBe(id);
});

test("b6 all kinds produce non-empty hint string", async () => {
  expect(factory).not.toBeNull();
  for (const kind of Object.keys(URL_FOR_KIND)) {
    const r = callWithAliases(factory, kind, "x");
    expect(r, `factory rejected all aliases for ${kind}`).not.toBeNull();
    const hint = extractHint(r!.binding);
    expect(hint, `no hint string for ${kind}`).toBeTruthy();
    expect(hint!.length, `hint too short for ${kind}`).toBeGreaterThan(20);
  }
});

// One test per kind. Each verifies (a) right URL appears, (b) hint is NOT a stub
// containing all kinds' URLs in one string.
for (const [kind, urlRe] of Object.entries(URL_FOR_KIND)) {
  test(`b6 ${kind} routes to its URL and not others`, async () => {
    expect(factory).not.toBeNull();
    const r = callWithAliases(factory, kind, "x");
    expect(r, `factory rejected all aliases for ${kind}`).not.toBeNull();
    const hint = extractHint(r!.binding) ?? "";
    // Positive: the right URL for this kind
    expect(hint, `${kind} hint missing its URL`).toMatch(urlRe);
    // Negative (stub-defeat): the hint should not contain ≥3 other kinds' URLs
    let otherCount = 0;
    for (const [otherKind, otherRe] of Object.entries(URL_FOR_KIND)) {
      if (otherKind === kind) continue;
      if (otherRe.test(hint)) otherCount++;
    }
    expect(
      otherCount,
      `${kind} hint contains ${otherCount} other kinds' URLs — looks like a stub`,
    ).toBeLessThan(3);
  });
}
