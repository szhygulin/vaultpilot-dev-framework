/**
 * Claude Agent SDK binary override + libc auto-detection.
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
 * `claudeBinPath()` removes the manual step (issue #251): on a glibc host
 * it auto-resolves and returns the glibc sibling artifact, so the SDK never
 * reaches the broken musl binary. `VP_DEV_CLAUDE_BIN` remains an override
 * that always wins. Lookup is centralized here so every `query()` call site
 * picks it up by passing `pathToClaudeCodeExecutable: claudeBinPath()`.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * Dependency-injection seams for `claudeBinPath()`, mirroring
 * `PreflightSdkDeps`. Tests inject these so no real env, platform, libc, or
 * `require.resolve` work touches the host.
 */
export interface ClaudeBinDeps {
  /** Raw `VP_DEV_CLAUDE_BIN` reader (operator override). */
  envClaudeBin?: () => string | undefined;
  platform?: () => NodeJS.Platform;
  /**
   * glibc-runtime detector: a version string on a glibc host, `undefined`
   * on musl. Defaults to `process.report.getReport().header.glibcVersionRuntime`.
   */
  glibcVersionRuntime?: () => string | undefined;
  resolveGlibcBin?: () => string | null;
  fileExists?: (p: string) => boolean;
}

/**
 * Resolve the Claude Agent SDK binary to launch.
 *
 *   1. `VP_DEV_CLAUDE_BIN` set & non-empty → return it verbatim (override wins).
 *   2. glibc Linux host (where the SDK would otherwise pick the musl binary)
 *      → resolve & return the glibc sibling; `undefined` if it can't resolve
 *      (don't fabricate a path).
 *   3. musl Linux host → `undefined` (the SDK's musl default is correct).
 *   4. non-Linux (darwin / win32) → `undefined` (those platforms ship their
 *      own SDK artifacts; never return a linux glibc path off-Linux).
 */
export function claudeBinPath(deps: ClaudeBinDeps = {}): string | undefined {
  const envClaudeBin =
    deps.envClaudeBin ?? (() => process.env.VP_DEV_CLAUDE_BIN);
  const platformOf = deps.platform ?? (() => process.platform);
  const glibcRuntime = deps.glibcVersionRuntime ?? defaultGlibcVersionRuntime;
  const resolveGlibc = deps.resolveGlibcBin ?? defaultResolveGlibcBin;
  const fileExists = deps.fileExists ?? existsSync;

  const override = envClaudeBin();
  if (override && override.length > 0) return override;

  if (platformOf() !== "linux") return undefined;

  // musl host: SDK's musl-first default already launches a runnable binary.
  // Loader present is the authoritative musl signal; absence of the glibc
  // runtime version corroborates it.
  if (fileExists(MUSL_LOADER_PATH)) return undefined;
  if (glibcRuntime() === undefined) return undefined;

  // glibc host: return the glibc sibling so the SDK skips the broken musl
  // binary. Unresolvable → undefined (don't fabricate a path).
  return resolveGlibc() ?? undefined;
}

/**
 * `process.report.getReport().header.glibcVersionRuntime` is a version string
 * on glibc and absent on musl. `getReport()` is typed as `object`, so navigate
 * it defensively; any shape surprise (or a host without process.report) is
 * treated as "unknown libc" (undefined).
 */
function defaultGlibcVersionRuntime(): string | undefined {
  try {
    const report = process.report?.getReport() as
      | { header?: { glibcVersionRuntime?: unknown } }
      | undefined;
    const v = report?.header?.glibcVersionRuntime;
    return typeof v === "string" && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
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
 *   1. If a usable non-musl binary is resolvable (operator override OR the
 *      glibc sibling `claudeBinPath()` now auto-detects), the dispatch
 *      succeeds — return ok.
 *   2. Outside Linux (macOS / Windows), the musl probe doesn't apply.
 *   3. Resolve the musl SDK binary path (the one the SDK will pick first).
 *      If the package isn't installed, no probe is possible — return ok.
 *   4. The musl binary's ELF interpreter is hardcoded to
 *      `/lib/ld-musl-x86_64.so.1`. Existence of that loader on the host is
 *      a sufficient proxy: present → musl host (binary launches), absent →
 *      glibc host (binary fails at execve with the misleading error).
 *
 * Reconciliation with auto-detection (issue #251): `claudeBinPath()` now
 * auto-returns the glibc sibling on a glibc host, so the short-circuit keys
 * off the *resolved* path (`resolvedBin`), not the raw env var. A glibc host
 * with the glibc artifact present resolves a usable binary ⇒ ok (auto-fix
 * handles it, no false alarm). A glibc host whose glibc artifact is absent
 * resolves nothing ⇒ the safety net still fires, because the SDK would fall
 * through to the broken musl binary.
 */
export interface PreflightSdkDeps {
  /**
   * The resolved usable binary path — `claudeBinPath()`'s result (env
   * override OR auto-detected glibc sibling). Truthy ⇒ dispatch will launch
   * a runnable binary, so no warning is needed.
   */
  resolvedBin?: () => string | undefined;
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
  const resolvedBin = deps.resolvedBin ?? (() => claudeBinPath());
  const platformOf = deps.platform ?? (() => process.platform);
  const fileExists = deps.fileExists ?? existsSync;
  const resolveMusl = deps.resolveMuslBin ?? defaultResolveMuslBin;
  const resolveGlibc = deps.resolveGlibcBin ?? defaultResolveGlibcBin;

  // A usable non-musl binary is already resolved (env override OR the glibc
  // sibling auto-detected by claudeBinPath()) — the dispatch will launch a
  // runnable binary, so suppress the warning.
  if (resolvedBin()) return { ok: true };
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
    `  3. install the glibc SDK artifact (@anthropic-ai/claude-agent-sdk-linux-x64)\n` +
    `     so claudeBinPath()'s auto-detection (src/agent/sdkBinary.ts, #251) can\n` +
    `     resolve it — this branch fires only because it is unresolvable here.\n\n` +
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
