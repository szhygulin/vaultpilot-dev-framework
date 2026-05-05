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
`vp-dev run` shows the planned setup (target repo, summoned agents, issue range) and waits for explicit approval before launching. The gate is the human-in-the-loop checkpoint — agents start consuming Anthropic API tokens and writing to disk the moment the gate passes.

Three supported approval paths:
- **TTY y/N prompt** (default): preview prints; user types `y`.
- **`--yes`**: non-interactive auto-approve. Only for non-TTY environments where the human is upstream of the invocation (CI dispatchers, scheduled jobs); never as a convenience flag.
- **`--plan` + `--confirm <token>`** (two-step): `--plan` prints the preview + writes a short-lived token (15 min TTL) under `state/run-confirm-<token>.json`; human reads the preview, then re-invokes with `--confirm <token>` to launch. The token binds to a `previewHash`, so registry / open-issue drift between plan and confirm rejects the confirm and forces a fresh `--plan`. Used by Claude Code (the `Bash` tool is non-TTY, but the human sees the preview in chat between the two invocations).

- **Don't add a config-file option that silently bypasses** the gate. Convenience flags that hide the cost of a multi-agent run are exactly what this gate exists to prevent. The two-step flow is allowed because it surfaces the cost between invocations; single-flag silent bypasses are not.
- The gate text MUST surface the planned cost (agent count × issue range × model tier) so the user has the data to refuse. Edits that reduce the surfaced detail are regressions.

## Target repo's `CLAUDE.md` seeds fresh agents AND is loaded live every dispatch
The orchestrator reads the target repo's `CLAUDE.md` (`--target-repo-path/CLAUDE.md`, default `$HOME/dev/<repo-name>/CLAUDE.md`). Two paths use it:
1. **Fork-time seed** — `forkClaudeMd()` writes a verbatim copy into `agents/<agent-id>/CLAUDE.md` once when an agent is first minted. The per-agent file then drifts (summarizer-edited, hand-edited).
2. **Live load every dispatch** — `buildAgentSystemPrompt()` reads the *current* target-repo `CLAUDE.md` on every coding-agent run and prepends it as a "Project rules (live)" section, with overlapping `##` headings deduped against the per-agent copy (live wins). This means edits to the target-repo `CLAUDE.md` reach existing specialists immediately, without re-forking.
- **When the target repo has no `CLAUDE.md`**, fall back to the generic seed in `src/agent/prompt.ts`. Don't refuse to run — many target repos won't have one.
- **Don't modify the target repo's `CLAUDE.md` from within a run.** The seed is a read-only input, not a write surface. If a coding agent's output legitimately wants to update the target's CLAUDE.md, that lands as a normal PR through the agent's branch, not as a side-effect write.

## Pre-dispatch scope-fit check
- **Issues whose feature-plan touches >5 files should be split into Phase 1 / Phase 2 before dispatch.** Coding agents have a 50-turn budget; multi-file features with read→edit→re-read cycles exhaust it on file 6-7, hitting `error_max_turns` mid-edit with no PR and no envelope. Split along architectural seams (data layer / measurement vs. enforcement / abort flow), not arbitrary halves.
- **Tells**: `feature-plans/issue-N-*.md` lists >5 files in "Critical files"; plan mixes data-layer changes with orchestrator-lifecycle changes; both an interface-extension and an integration land in one issue; tags include both `cli-gate` / `cost-surface` / `ux-hardening` AND a state-layer concept.
- **How to apply**: before `vp-dev run --issues N`, read `feature-plans/issue-N-*.md` if present. If file count >5, file the split (Phase 1 = measurement / data layer; Phase 2 = enforcement / lifecycle integration) and close the original as superseded. Don't dispatch and hope.
- **Calibration: multiply stated file-counts by ~1.5×.** Issue authors systematically under-count the plumbing surface — pass-through layers (orchestrator → runIssueCore → codingAgent → buildAgentSystemPrompt) and CLI threading get omitted. Session 2026-05-05 data: #34 stated 9 files, Khwarizmi flagged 8-9 in a #116 pushback that the body had estimated "~5 files"; #99 stated 4, shipped 5 (548 lines). When checking against the >5 threshold, treat "states 4 files" as `≈6` actual.
- Past incident 2026-05-04: issue #34 ("Hard cost ceiling per run with graceful abort") had a 9-file plan, dispatched twice, both `error_max_turns`, ~$8.30 burned, zero PRs. Split into [#85](https://github.com/szhygulin/vaultpilot-development-agents/issues/85) (Phase 1, measurement) + [#86](https://github.com/szhygulin/vaultpilot-development-agents/issues/86) (Phase 2, enforcement); #85 succeeded on first dispatch as PR [#93](https://github.com/szhygulin/vaultpilot-development-agents/pull/93).

## Re-dispatch discipline: check for salvageable partial work first
- **Before re-dispatching a failed issue, run `git ls-remote origin 'refs/heads/vp-dev/*-incomplete-*' | grep "issue-<N>-incomplete"`.** PR [#92](https://github.com/szhygulin/vaultpilot-development-agents/pull/92)'s safety net pushes partial worktree edits to `vp-dev/<agent>/issue-<N>-incomplete-<runId>` on any non-clean exit. The work is often >90% complete — agents typically run out of budget at the closing sequence (build/commit/push/PR), not at the implementation step.
- **How to apply**: when an `-incomplete-` ref exists, salvage by hand instead of re-dispatching from main. Recipe: `git worktree add .claude/worktrees/salvage-<N> -b vp-dev/<agent>/issue-<N> origin/<incomplete-ref>` (note: drop the `-incomplete-<runId>` suffix so the new branch name matches `VP_DEV_BRANCH_RE` and PR [#74](https://github.com/szhygulin/vaultpilot-development-agents/pull/74)'s open-PR sweep recognizes it), then `git rebase origin/main`, run typecheck/build/test, fix any small gaps, amend the salvage commit to a clean conventional-commit message, push, open PR with `Closes #N`.
- Past incident 2026-05-05: 3 of 11 dispatched issues failed with `error_max_turns` (~\$12 in agent time burned). All 3 had partial branches with substantively complete work (#84 missing 2 lines of CLI wiring, #86 had tests but no commit, #99 was 549 lines complete with a stuck commit step). Salvaged by hand into PRs #114/#113/#112 in <30 min total — re-dispatching from main would have re-burned ~\$12 hitting the same wall. #119 (Phase 2 of resume-incomplete) eventually automates this; until then it's a manual operator habit.

## Per-agent `CLAUDE.md` grows from successful runs
After every successful issue-resolution run, a separate sonnet summarizer rewrites `agents/<agent-id>/CLAUDE.md` to fold in lessons from the run. The file is gitignored — local-only memory.
- Hand-editing `agents/<agent-id>/CLAUDE.md` between runs is allowed (e.g. trimming bloat, removing stale entries) but the summarizer **overwrites it** on the next successful run, so changes are short-lived.
- **Don't load-bear on per-agent CLAUDE.md content for correctness.** The agent's invariants must come from its prompt + tooling, not from a memory file the summarizer can rewrite.
- The auto-generated `agents/agent-90e4/CLAUDE.md` etc. are derivative copies of the target repo's seed — their staleness reflects the target's pre-summary state. Don't treat them as authoritative for the target repo's current rules.

## CI is a hard gate
`.github/workflows/ci.yml` runs `npm ci && npm run typecheck && npm run build` on every push and PR. All three must pass. CI failures block merges; reproduce locally with the same three commands before pushing if a PR is failing for unclear reasons.

## Lessons-learned discipline fires on `vp-dev` runs too
The global **Post-PR Lessons-Learned Discipline** rule fires after opening a PR. In this repo, also apply it after every `vp-dev` invocation that probes tool behavior — both dry-runs (`--dry-run`) and actual executions of development sessions. Each run exercises the orchestrator end-to-end (approval gate, push-protection layers, agent isolation, summarizer, target-repo seeding) and surfaces patterns that code review alone won't catch.
- **Split bugs from lessons before applying the candidate framework.** `vp-dev` runs surface two distinct buckets: (a) bugs / design defects in the harness (gate over-restrictions, summarizer schema-invalid crashes, orchestrator dispatch quirks, missing logging) → propose fixes or file issues against this repo, do NOT run through contradiction + context-cost analysis; (b) genuine process habits / meta-skills → run through the 2-global + 2-local candidate framework per the global rule. Output the two buckets as separate sections.
- Format for the lessons bucket: same as the global rule — 2 global candidates + 2 local candidates, ranked, with contradiction check + context-cost analysis per candidate.
- Skip when: the run was a pure repro of unchanged config, or nothing non-trivial surfaced (clean dry-run that matched expectations).
- Apply when: a new failure mode appeared, the gate / push-protection / approval flow behaved unexpectedly, an agent boundary leaked, the summarizer produced a surprise, or the user pushed back on framing.
- Local-scope lessons land in this `CLAUDE.md` bundled into the same PR as the work that triggered them; global-scope lessons go to `~/.claude/CLAUDE.md` as a separate commit in the `claude-md-global` repo.
- Past incident 2026-05-01: dry-run test on 4 oldest vaultpilot-mcp issues (#156, #162, #558, #559) surfaced 4 findings — compound-command gate over-restriction, summarizer schema-invalid bug (2× in one run), orchestrator dispatched only 1/2 idle agents at tick 2, network-to-registry curls blocked. All 4 are bugs / design observations, not process habits. First-pass output ran them through the candidate framework and concluded "not worth a rule" for all 4 — wasting the user's attention because the right framing was "file these as fixes" all along. The bug/lesson split codifies the right routing.
