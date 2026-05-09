import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROBE_PACKAGE,
  ensureNodeModules,
  type PreflightNodeModulesDeps,
} from "./preflightNodeModules.js";

// Issue #264: when node_modules is wiped after a successful run, the bin
// shim's dynamic import of cli.js fails with a misleading
// `ERR_MODULE_NOT_FOUND: 'commander'` stack. ensureNodeModules() probes a
// known runtime dep before that import and surfaces an actionable
// "run npm ci" message + clean exit. Tests pin the two branches against
// fully-injected dependencies — no real filesystem, no real exit — so the
// suite is deterministic across hosts.

interface CapturedExit {
  code: number | null;
  writes: string[];
}

function capturedDeps(
  overrides: Partial<PreflightNodeModulesDeps> = {},
): { deps: PreflightNodeModulesDeps; captured: CapturedExit } {
  const captured: CapturedExit = { code: null, writes: [] };
  const deps: PreflightNodeModulesDeps = {
    resolveProbe: () => "/repo/node_modules/commander/package.json",
    write: (s) => captured.writes.push(s),
    exit: (c) => {
      captured.code = c;
      // Throw a sentinel so test code can assert exit was called without
      // actually terminating the test runner. The production code's exit
      // type is `never`, so callers don't observe the throw in practice.
      throw new Error(`__exit__:${c}`);
    },
    ...overrides,
  };
  return { deps, captured };
}

test("ensureNodeModules: probe resolves → ok, no write, no exit", () => {
  const { deps, captured } = capturedDeps();
  const r = ensureNodeModules(deps);
  assert.deepEqual(r, { ok: true });
  assert.equal(captured.code, null);
  assert.equal(captured.writes.length, 0);
});

test("ensureNodeModules: probe fails → write 'npm ci' message and exit(1)", () => {
  const { deps, captured } = capturedDeps({ resolveProbe: () => null });
  assert.throws(() => ensureNodeModules(deps), /__exit__:1/);
  assert.equal(captured.code, 1);
  assert.equal(captured.writes.length, 1);
  const msg = captured.writes[0];
  assert.match(msg, /dependencies missing/);
  assert.match(msg, /commander/);
  assert.match(msg, /npm ci/);
  assert.match(msg, /#264/);
});

test("PROBE_PACKAGE is commander (bare main entry)", () => {
  // commander is the first npm dep the CLI imports; the probe must stay
  // bound to it so the preflight tracks the actual import contract. If the
  // CLI's first dep ever changes, this assertion forces us to update the
  // probe in the same PR. Bare name (not "commander/package.json"): commander
  // doesn't expose `./package.json` via its exports map, so a subpath probe
  // would always fail with ERR_PACKAGE_PATH_NOT_EXPORTED even when installed.
  assert.equal(PROBE_PACKAGE, "commander");
});

test("ensureNodeModules: real default probe resolves commander in this checkout", () => {
  // Sanity check on the production resolve path — confirms the bare-name
  // probe actually finds commander on a fresh checkout where this PR's
  // structural fix (untracked node_modules) is in place. If commander is
  // missing the test runner itself wouldn't have been able to import this
  // file, so a passing assertion here means the probe agrees with reality.
  const r = ensureNodeModules();
  assert.deepEqual(r, { ok: true });
});
