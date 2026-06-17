import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MUSL_LOADER_PATH,
  claudeBinPath,
  preflightSdkBinary,
  type ClaudeBinDeps,
  type PreflightSdkDeps,
} from "./sdkBinary.js";

// Issue #251: `claudeBinPath()` auto-detects host libc and returns the glibc
// sibling artifact on a glibc host where the SDK would otherwise pick the
// broken musl binary. These tests pin every branch against fully-injected
// dependencies — no real env, platform, libc, or `require.resolve` work
// touches the host — so the suite passes identically on macOS, Linux, Windows.

const GLIBC_BIN =
  "/repo/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude";

function binDeps(overrides: Partial<ClaudeBinDeps>): ClaudeBinDeps {
  return {
    envClaudeBin: () => undefined,
    platform: () => "linux",
    // glibc host by default: runtime version present, musl loader absent.
    glibcVersionRuntime: () => "2.39",
    resolveGlibcBin: () => GLIBC_BIN,
    fileExists: () => false,
    ...overrides,
  };
}

test("claudeBinPath: VP_DEV_CLAUDE_BIN override wins verbatim", () => {
  const r = claudeBinPath(
    binDeps({ envClaudeBin: () => "/custom/claude" }),
  );
  assert.equal(r, "/custom/claude");
});

test("claudeBinPath: empty env override is ignored (not returned verbatim)", () => {
  // glibc host with empty env → falls through to auto-detection → glibc bin.
  const r = claudeBinPath(binDeps({ envClaudeBin: () => "" }));
  assert.equal(r, GLIBC_BIN);
});

test("claudeBinPath: glibc host, no env → returns glibc sibling path", () => {
  const r = claudeBinPath(binDeps({}));
  assert.equal(r, GLIBC_BIN);
});

test("claudeBinPath: glibc host but glibc artifact unresolvable → undefined", () => {
  const r = claudeBinPath(binDeps({ resolveGlibcBin: () => null }));
  assert.equal(r, undefined);
});

test("claudeBinPath: musl host (loader present) → undefined (SDK default is correct)", () => {
  const r = claudeBinPath(
    binDeps({
      glibcVersionRuntime: () => undefined,
      fileExists: (p) => p === MUSL_LOADER_PATH,
    }),
  );
  assert.equal(r, undefined);
});

test("claudeBinPath: musl host (no glibc runtime, loader present) → undefined even if glibc resolvable", () => {
  const r = claudeBinPath(
    binDeps({
      glibcVersionRuntime: () => undefined,
      fileExists: (p) => p === MUSL_LOADER_PATH,
      resolveGlibcBin: () => GLIBC_BIN,
    }),
  );
  assert.equal(r, undefined);
});

test("claudeBinPath: darwin → undefined (never a linux glibc path off-Linux)", () => {
  const r = claudeBinPath(binDeps({ platform: () => "darwin" }));
  assert.equal(r, undefined);
});

test("claudeBinPath: win32 → undefined (never a linux glibc path off-Linux)", () => {
  const r = claudeBinPath(binDeps({ platform: () => "win32" }));
  assert.equal(r, undefined);
});

// Issue #245: pre-dispatch libc preflight in `vp-dev run`. These tests pin
// the four detection branches against fully-injected dependencies — no real
// filesystem, platform, or `require.resolve` work touches the host — so the
// suite passes identically on macOS dev boxes, Linux CI, and Windows. The
// branches mirror the issue body's "Fix one of" enumeration: env override
// already set / non-Linux / musl SDK not installed / musl loader present /
// musl loader absent (the actual mismatch we want to catch).

// `resolvedBin` is the full `claudeBinPath()` result (env override OR
// auto-detected glibc sibling). It defaults to `undefined` here so each
// branch test opts in explicitly. Issue #251 reconciled the preflight
// short-circuit against the resolved path rather than the raw env var, so
// auto-detection suppresses the false alarm without disabling the safety net.
function deps(overrides: Partial<PreflightSdkDeps>): PreflightSdkDeps {
  return {
    resolvedBin: () => undefined,
    platform: () => "linux",
    resolveMuslBin: () => "/repo/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude",
    resolveGlibcBin: () => "/repo/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude",
    fileExists: () => false,
    ...overrides,
  };
}

test("preflightSdkBinary: VP_DEV_CLAUDE_BIN override → ok (operator owns the choice)", () => {
  const r = preflightSdkBinary(
    deps({ resolvedBin: () => "/custom/claude" }),
  );
  assert.deepEqual(r, { ok: true });
});

test("preflightSdkBinary: non-Linux platform → ok (no musl probe applies)", () => {
  const r = preflightSdkBinary(deps({ platform: () => "darwin" }));
  assert.deepEqual(r, { ok: true });
});

test("preflightSdkBinary: musl SDK not installed → ok (SDK won't pick it either)", () => {
  const r = preflightSdkBinary(deps({ resolveMuslBin: () => null }));
  assert.deepEqual(r, { ok: true });
});

test("preflightSdkBinary: musl loader present (musl host) → ok", () => {
  const r = preflightSdkBinary(
    deps({ fileExists: (p) => p === MUSL_LOADER_PATH }),
  );
  assert.deepEqual(r, { ok: true });
});

test("preflightSdkBinary: glibc host + glibc artifact resolvable (auto-fix) → ok (no false alarm)", () => {
  // claudeBinPath() would auto-return the glibc sibling on this host, so the
  // dispatch succeeds without the operator setting VP_DEV_CLAUDE_BIN.
  const r = preflightSdkBinary(
    deps({
      resolvedBin: () =>
        "/repo/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude",
    }),
  );
  assert.deepEqual(r, { ok: true });
});

test("preflightSdkBinary: glibc host + glibc artifact NOT resolvable → mismatch fires (safety net intact)", () => {
  // Auto-fix can't help (glibc artifact missing) → preflight must still warn.
  const r = preflightSdkBinary(
    deps({ resolvedBin: () => undefined, resolveGlibcBin: () => null }),
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /musl-linked binary/);
  assert.match(r.hint, /VP_DEV_CLAUDE_BIN=<path to glibc claude binary/);
});

test("preflightSdkBinary: musl SDK present + loader absent → mismatch with glibc hint", () => {
  const r = preflightSdkBinary(deps({ fileExists: () => false }));
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.reason, /musl-linked binary/);
  assert.match(r.reason, /\/lib\/ld-musl-x86_64\.so\.1/);
  assert.match(r.hint, /VP_DEV_CLAUDE_BIN=\/repo\/node_modules\/@anthropic-ai\/claude-agent-sdk-linux-x64\/claude/);
  assert.match(r.hint, /musl-disabled/);
  assert.match(r.hint, /Aborting before dispatch/);
});

test("preflightSdkBinary: musl SDK present + loader absent + glibc unresolved → mismatch with generic hint", () => {
  const r = preflightSdkBinary(
    deps({ fileExists: () => false, resolveGlibcBin: () => null }),
  );
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.match(r.hint, /VP_DEV_CLAUDE_BIN=<path to glibc claude binary/);
});
