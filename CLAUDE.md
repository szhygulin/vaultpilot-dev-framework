# Project rules for Claude

> **Generic process rules live in `~/.claude/CLAUDE.md`** (auto-loaded by Claude Code from the private [claude-md-global](https://github.com/szhygulin/claude-md-global) repo). The rules below are project-specific or override global defaults.

## Git workflow — project-specific
- Repo root: `/home/szhygulin/dev/vaultpilot-development-agents`. Worktree path template: `.claude/worktrees/<branch-name>` (relative). Run `pwd` after `cd /home/szhygulin/dev/vaultpilot-development-agents` if uncertain — the global "cd repo root before worktree add" rule applies.
- Default base for new branches: `origin/main`. No stacking — global "branch every new PR off the base branch" applies.

## Per-agent workdir is `agents/<agent-id>/`
Each coding agent dispatched by the orchestrator runs in its own `agents/<agent-id>/` sandbox. Cross-agent writes corrupt parallel runs.
- `agents/`, `state/`, `logs/`, `dist/` are all gitignored — local state only. Never push agent transcripts, registry entries, run logs, or compiled output to `origin`.
- `agents/<agent-id>/CLAUDE.md` is the per-agent memory; `agents/<agent-id>/` may also carry transcripts, summaries, and per-issue artifacts. Boundaries between agents matter: `agent-90e4/` must not write into `agent-51e5/` even if they're operating on the same target repo.
- If a one-off debug run needs scratch files, put them under the per-agent dir or under `claude-work/` (gitignored cross-project). Never the repo root.

## Three-layer push-protection for the target repo is load-bearing
The orchestrator dispatches coding agents against a `--target-repo` (any GitHub repo with a local clone). Three independent layers prevent an agent from pushing to the target's `main`:
1. **Branch protection** on the target's `main` (configured at GitHub).
2. **`disallowedTools`** restricting `git push origin main` and equivalents.
3. **`canUseTool` regex gate** that intercepts compound commands (`git ... && git push origin main`, `git push origin HEAD:main`, etc.) before the SDK forwards them.

All three stay. Weakening any one (relaxing the regex, removing a `disallowedTools` entry, branch-protection rule edits at the target) is a security regression — surface it explicitly in the PR description and require user sign-off, don't merge silently. Past incident `a3cd8dc` (Fix dry-run gate: streaming input + compound-command denial) tightened the canUseTool layer specifically for compound-command bypasses.

## Approval gate before launch is mandatory
`vp-dev run` shows the planned setup (target repo, summoned agents, issue range) and waits for explicit `y/N` confirmation before launching. The gate is the human-in-the-loop checkpoint — agents start consuming Anthropic API tokens and writing to disk the moment the gate passes.
- `--yes` is the ONLY supported bypass, and only for non-TTY environments (CI dispatchers, scheduled jobs).
- **Don't add a config-file option that silently bypasses** the gate. Convenience flags that hide the cost of a multi-agent run are exactly what this gate exists to prevent.
- The gate text MUST surface the planned cost (agent count × issue range × model tier) so the user has the data to refuse. Edits that reduce the surfaced detail are regressions.

## Target repo's `CLAUDE.md` seeds fresh agents
The orchestrator reads the target repo's `CLAUDE.md` (`--target-repo-path/CLAUDE.md`, default `$HOME/dev/<repo-name>/CLAUDE.md`) and seeds every fresh "general" agent with it. Specialists carry their own `agents/<agent-id>/CLAUDE.md` from prior successful runs.
- **When the target repo has no `CLAUDE.md`**, fall back to the generic seed in `src/agent/prompt.ts`. Don't refuse to run — many target repos won't have one.
- **Don't modify the target repo's `CLAUDE.md` from within a run.** The seed is a read-only input, not a write surface. If a coding agent's output legitimately wants to update the target's CLAUDE.md, that lands as a normal PR through the agent's branch, not as a side-effect write.

## Per-agent `CLAUDE.md` grows from successful runs
After every successful issue-resolution run, a separate sonnet summarizer rewrites `agents/<agent-id>/CLAUDE.md` to fold in lessons from the run. The file is gitignored — local-only memory.
- Hand-editing `agents/<agent-id>/CLAUDE.md` between runs is allowed (e.g. trimming bloat, removing stale entries) but the summarizer **overwrites it** on the next successful run, so changes are short-lived.
- **Don't load-bear on per-agent CLAUDE.md content for correctness.** The agent's invariants must come from its prompt + tooling, not from a memory file the summarizer can rewrite.
- The auto-generated `agents/agent-90e4/CLAUDE.md` etc. are derivative copies of the target repo's seed — their staleness reflects the target's pre-summary state. Don't treat them as authoritative for the target repo's current rules.

## CI is a hard gate
`.github/workflows/ci.yml` runs `npm ci && npm run typecheck && npm run build` on every push and PR. All three must pass. CI failures block merges; reproduce locally with the same three commands before pushing if a PR is failing for unclear reasons.

## Lessons-learned discipline fires on `vp-dev` runs too
The global **Post-PR Lessons-Learned Discipline** rule fires after opening a PR. In this repo, also apply it after every `vp-dev` invocation that probes tool behavior — both dry-runs (`--dry-run`) and actual executions of development sessions. Each run exercises the orchestrator end-to-end (approval gate, push-protection layers, agent isolation, summarizer, target-repo seeding) and surfaces patterns that code review alone won't catch.
- Format: same as the global rule — 2 global candidates + 2 local candidates, ranked, with contradiction check + context-cost analysis per candidate.
- Skip when: the run was a pure repro of unchanged config, or nothing non-trivial surfaced (clean dry-run that matched expectations).
- Apply when: a new failure mode appeared, the gate / push-protection / approval flow behaved unexpectedly, an agent boundary leaked, the summarizer produced a surprise, or the user pushed back on framing.
- Local-scope lessons land in this `CLAUDE.md` bundled into the same PR as the work that triggered them; global-scope lessons go to `~/.claude/CLAUDE.md` as a separate commit in the `claude-md-global` repo.
