# vp-dev — development-agent framework

LLM-driven development session: a sonnet orchestrator dispatches GitHub issues
to N parallel opus coding agents, each running against an evolving per-agent
`CLAUDE.md` that grows with every successful run.

Works on **any GitHub repo**, not tied to a specific project.

## Usage

```sh
# install + build
npm ci
npm run build

# run against any repo (must have a local clone)
ANTHROPIC_API_KEY=... \
  node dist/bin/vp-dev.js run \
    --target-repo OWNER/REPO \
    --agents 5 \
    --issues 100-150
```

The runner shows the planned setup (target, summoned agents, issues) and waits
for `y/N` confirmation before launching agents. Pass `--yes` to auto-approve
(required for non-TTY environments).

### Flags

| Flag | Description |
|---|---|
| `--target-repo <owner/repo>` | **Required.** GitHub repo to work on. |
| `--agents <n>` | **Required.** Parallelism. |
| `--issues <range>` | `100-150`, `100,103,108`, or `all-open`. Required unless `--resume`. |
| `--target-repo-path <path>` | Local clone path. Default: `$HOME/dev/<repo-name>`. |
| `--dry-run` | Intercept comment / PR / push tools with synthetic responses. |
| `--resume` | Resume the most recent unfinished run. |
| `--yes` | Skip the approval gate. |
| `--max-ticks <n>` | Safety cap on scheduling ticks (default 200). |
| `--verbose` | Mirror a colorized event subset to stderr. |

### Other commands

```sh
node dist/bin/vp-dev.js status        # current run summary
node dist/bin/vp-dev.js agents list   # registry roster
```

## How it works

- The target repo's `CLAUDE.md` is the seed for fresh agents. If the target
  repo has no `CLAUDE.md`, a short generic seed is used. Each agent has its
  own `agents/<agent-id>/CLAUDE.md` that grows after every successful run via
  a separate sonnet summarizer.
- The orchestrator scores the registry against each tick's pending-issue set
  (max-pair Jaccard + experience prior) and summons the top-N specialists,
  minting fresh "general" agents only to fill remaining slots.
- Three layers block pushes to `main` of the target repo: branch protection,
  `disallowedTools`, and a `canUseTool` regex.

## Troubleshooting

### `Claude Code native binary not found at …-musl/claude` on Linux

`npm install` pulls both the musl and glibc SDK binaries as optional deps;
the SDK's resolution order tries musl first, so on glibc hosts (Ubuntu,
Debian, Fedora, RHEL) `query()` launches an ELF whose interpreter
(`/lib/ld-musl-x86_64.so.1`) doesn't exist and aborts.

Override the binary path via `VP_DEV_CLAUDE_BIN`:

```sh
export VP_DEV_CLAUDE_BIN=$PWD/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude
```

Every `query()` call site reads this env var (centralized in
`src/agent/sdkBinary.ts`) and passes it as `pathToClaudeCodeExecutable`.

## License

MIT — see [LICENSE](LICENSE).
