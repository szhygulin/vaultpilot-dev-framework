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
| `--stalled-threshold-days <n>` | Mark an open PR as stalled after N days (default 14). |
| `--verbose` | Mirror a colorized event subset to stderr. |

### Other commands

```sh
node dist/bin/vp-dev.js status         # current run summary
node dist/bin/vp-dev.js agents list    # registry roster
node dist/bin/vp-dev.js agents stats   # merge-rate / median-rework / $/merge per agent
```

`agents stats` polls each non-terminal PR via `gh pr view` once, then
appends terminal records to `state/outcomes/<agent>.jsonl`. Pass
`--no-poll` to skip the GitHub round-trip and report only what's already
on disk.

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

## License

MIT — see [LICENSE](LICENSE).
