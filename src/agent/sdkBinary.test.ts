import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MUSL_LOADER_PATH,
  preflightSdkBinary,
  type PreflightSdkDeps,
} from "./sdkBinary.js";

// Issue #245: pre-dispatch libc preflight in `vp-dev run`. These tests pin
// the four detection branches against fully-injected dependencies — no real
// filesystem, platform, or `require.resolve` work touches the host — so the
// suite passes identically on macOS dev boxes, Linux CI, and Windows. The
// branches mirror the issue body's "Fix one of" enumeration: env override
// already set / non-Linux / musl SDK not installed / musl loader present /
// musl loader absent (the actual mismatch we want to catch).

function deps(overrides: Partial<PreflightSdkDeps>): PreflightSdkDeps {
  return {
    envClaudeBinPath: () => undefined,
    platform: () => "linux",
    resolveMuslBin: () => "/repo/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude",
    resolveGlibcBin: () => "/repo/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude",
    fileExists: () => false,
    ...overrides,
  };
}

test("preflightSdkBinary: VP_DEV_CLAUDE_BIN override → ok (operator owns the choice)", () => {
  const r = preflightSdkBinary(
    deps({ envClaudeBinPath: () => "/custom/claude" }),
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
