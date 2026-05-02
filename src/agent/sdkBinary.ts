/**
 * Claude Agent SDK binary override.
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
export function claudeBinPath(): string | undefined {
  const v = process.env.VP_DEV_CLAUDE_BIN;
  return v && v.length > 0 ? v : undefined;
}
