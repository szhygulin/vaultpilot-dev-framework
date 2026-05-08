/**
 * Claude Agent SDK binary override + libc preflight.
 *
 * Background: `npm install` pulls both
 * `@anthropic-ai/claude-agent-sdk-linux-x64-musl` and
 * `@anthropic-ai/claude-agent-sdk-linux-x64` (glibc) as optional deps. The
 * SDK's resolution order tries musl first, so on a glibc host (Ubuntu /
 * Debian / Fedora / RHEL) `createRequire` succeeds for the musl package
 * directory and the SDK launches `…-musl/claude` — whose ELF interpreter
 * is `/lib/ld-musl-x86_64.so.1`, which doesn't exist on glibc. The exec
 * aborts and the SDK throws "Claude Code native binary not found at …".
 *
 * Workaround surface: setting `VP_DEV_CLAUDE_BIN` lets the operator point
 * every `query()` call at a known-good binary (typically the glibc one
 * under `node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude`)
 * without editing `node_modules` after each `npm ci`.
 *
 * Lookup is centralized here so any future `query()` call site picks it up
 * automatically by passing `pathToClaudeCodeExecutable: claudeBinPath()`.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

export function claudeBinPath(): string | undefined {
  const v = process.env.VP_DEV_CLAUDE_BIN;
  return v && v.length > 0 ? v : undefined;
}

/**
 * Issue #245: detect the libc/SDK-binary mismatch BEFORE the orchestrator
 * dispatches N agents. The SDK's exec-time failure surfaces as a misleading
 * "Claude Code native binary not found" error and triage's post-mortem gate
 * then refuses to re-dispatch the affected issues without
 * `--include-non-ready`. One detectable host condition cascades into N
 * identical agent crashes plus a triage gate; preflight catches it once.
 *
 * Detection (cheap, no exec required):
 *   1. If the operator already overrode via `VP_DEV_CLAUDE_BIN`, trust them.
 *   2. Outside Linux (macOS / Windows), the musl probe doesn't apply.
 *   3. Resolve the musl SDK binary path (the one the SDK will pick first).
 *      If the package isn't installed, no probe is possible — return ok.
 *   4. The musl binary's ELF interpreter is hardcoded to
 *      `/lib/ld-musl-x86_64.so.1`. Existence of that loader on the host is
 *      a sufficient proxy: present → musl host (binary launches), absent →
 *      glibc host (binary fails at execve with the misleading error).
 *
 * Becomes obsolete once `claudeBinPath()` learns to auto-fall-back to the
 * glibc binary on libc mismatch (issue #251 follow-up).
 */
export interface PreflightSdkDeps {
  envClaudeBinPath?: () => string | undefined;
  platform?: () => NodeJS.Platform;
  resolveMuslBin?: () => string | null;
  resolveGlibcBin?: () => string | null;
  fileExists?: (p: string) => boolean;
}

export type PreflightSdkResult =
  | { ok: true }
  | { ok: false; reason: string; hint: string };

export const MUSL_LOADER_PATH = "/lib/ld-musl-x86_64.so.1";

export function preflightSdkBinary(
  deps: PreflightSdkDeps = {},
): PreflightSdkResult {
  const envBin = deps.envClaudeBinPath ?? claudeBinPath;
  const platformOf = deps.platform ?? (() => process.platform);
  const fileExists = deps.fileExists ?? existsSync;
  const resolveMusl = deps.resolveMuslBin ?? defaultResolveMuslBin;
  const resolveGlibc = deps.resolveGlibcBin ?? defaultResolveGlibcBin;

  if (envBin()) return { ok: true };
  if (platformOf() !== "linux") return { ok: true };

  const muslBin = resolveMusl();
  if (!muslBin) return { ok: true };
  if (fileExists(MUSL_LOADER_PATH)) return { ok: true };

  const glibcBin = resolveGlibc();
  const fix1 = glibcBin
    ? `  1. export VP_DEV_CLAUDE_BIN=${glibcBin}`
    : `  1. export VP_DEV_CLAUDE_BIN=<path to glibc claude binary, e.g. node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude>`;
  const hint =
    `Fix one of:\n${fix1}\n` +
    `  2. mv ${muslBin} ${muslBin}.musl-disabled  (re-apply after every npm ci)\n` +
    `  3. (future) auto-fallback in src/agent/sdkBinary.ts — see #29 / #251 follow-up\n\n` +
    `Aborting before dispatch to avoid N identical agent crashes + triage post-mortem gate.`;

  return {
    ok: false,
    reason:
      `Claude Agent SDK will pick the musl-linked binary at\n  ${muslBin}\n` +
      `on this host, but the musl loader (${MUSL_LOADER_PATH}) is not present. ` +
      `The exec will fail with the misleading "Claude Code native binary not found" error.`,
    hint,
  };
}

function defaultResolveMuslBin(): string | null {
  return tryResolve("@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude");
}

function defaultResolveGlibcBin(): string | null {
  return tryResolve("@anthropic-ai/claude-agent-sdk-linux-x64/claude");
}

function tryResolve(spec: string): string | null {
  try {
    // Anchor resolution at cwd so a globally-installed vp-dev still finds
    // the SDK in the user's project node_modules. Mirrors how the SDK
    // itself resolves its companion binaries at query() time.
    const req = createRequire(`${process.cwd()}/`);
    return req.resolve(spec);
  } catch {
    return null;
  }
}
