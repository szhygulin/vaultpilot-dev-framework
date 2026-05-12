# Project rules for Claude

> **Generic process rules live in `~/.claude/CLAUDE.md`** (auto-loaded by Claude Code from the private [claude-md-global](https://github.com/szhygulin/claude-md-global) repo). The rules below are project-specific or override global defaults.

## Git workflow — project-specific
- Repo root: `/home/szhygulin/dev/vaultpilot-dev-framework`. Worktree path template: `.claude/worktrees/<branch-name>` (relative). Run `pwd` after `cd /home/szhygulin/dev/vaultpilot-dev-framework` if uncertain — the global "cd repo root before worktree add" rule applies.
- Default base for new branches: `origin/main`. No stacking — global "branch every new PR off the base branch" applies.

## Per-agent workdir is `agents/<agent-id>/`
Each coding agent dispatched by the orchestrator runs in its own `agents/<agent-id>/` sandbox. Cross-agent writes corrupt parallel runs.
- `agents/`, `state/`, `logs/`, `dist/` are all gitignored — local state only. Never push agent transcripts, registry entries, run logs, or compiled output to `origin`.
- `agents/<agent-id>/CLAUDE.md` is the per-agent memory; `agents/<agent-id>/section-tags.json` is the per-section tags sidecar (operator-only metadata, kept out of the agent's prompt context); `agents/<agent-id>/` may also carry transcripts, summaries, and per-issue artifacts. Boundaries between agents matter: `agent-90e4/` must not write into `agent-51e5/` even if they're operating on the same target repo.
- If a one-off debug run needs scratch files, put them under the per-agent dir or under `claude-work/` (gitignored cross-project). Never the repo root.
- **Sentinel-tag sidecar (post-`refactor/tags-to-sidecar`)**: `appendBlock` writes section tags to `agents/<id>/section-tags.json` keyed by `deriveStableSectionId(runId, issueIds)`. The sentinel header is now `<!-- run:R issue:#N outcome:O ts:T -->` (no `tags:`). Pre-existing CLAUDE.mds with legacy `tags:` parse fine but should be migrated once via `vp-dev agents migrate-tags-to-sidecar --all` to keep operator-only metadata out of the agent's context.

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

## Approval gate cost-forecast caveat: `(no plan; fallback estimate)` is a lower bound
- **When `vp-dev run --plan` per-issue forecast prints `(no plan; fallback estimate)` next to each issue, treat the TOTAL as a lower bound, not a midpoint.** The legacy fallback constant is $1.50/issue; observed real-world means run 3–4× higher (smoke-test mean $5.12 in `ROADMAP.md`; latest 11-issue smoke run was $5.35/issue / $58.90 total against a $16.50 forecast). After [#249](https://github.com/szhygulin/vaultpilot-dev-framework/issues/249) landed, the static `(no plan; fallback estimate)` label only renders on a fresh state dir (no eligible runs yet); operators with prior history see `(no plan; rolling history, N runs)` against a recency-weighted median of `costAccumulatedUsd / numCompleted` from the last 20 completed runs (5 most-recent weighted 2×).
- **How to apply**: if no `--max-cost-usd` is set and the forecast still shows the LEGACY `(no plan; fallback estimate)` label, multiply the displayed total by ~4× for a worst-case ceiling decision, or pass `--max-cost-usd <real-cap>` to bound the run. The new `(rolling history, N runs)` label is calibrated against the operator's own dispatch history; trust it as a midpoint, not a lower bound (still set `--max-cost-usd` for cap-driven runs).

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

## Pre-dispatch bake-window check
- **When a successor-phase issue body states an explicit bake-window** (e.g. "do not dispatch until #X has run for at least N months", "mirroring the #X → #Y deferral pattern"), treat elapsed time since the predecessor's PR merge as a *separate hard gate* from whether the predecessor code landed. "Predecessor code merged" ≠ "predecessor output corpus accumulated."
- **Why this matters**: a Phase B that validates Phase A's *runtime output* (proposals, validators-against-real-cases, calibration data) cannot be meaningfully implemented against a zero-size corpus. Early dispatch produces validators calibrated against guessed edge cases instead of observed ones — the failure the bake-window was written to prevent.
- **Tells**: issue body contains "do not dispatch until", "at least N months of runs", or explicitly references a prior deferral pattern (e.g. "mirroring the #X → #Y deferral"). Also fires when the issue depends on a predecessor's *proposals / logs / observations* rather than its code alone.
- **How to apply**: in pre-dispatch triage, verify both (1) predecessor PR merged AND (2) `gh pr view <PR> --json mergedAt` → `(today − mergedAt) ≥ stated bake-window`. If either fails, push back with: the merge date, elapsed days, gap remaining, and the three standard alternatives — defer to the stated horizon, reframe as a plumbing-only Phase B0 with a `STUDY_PENDING` validator placeholder, or synthesize the corpus via a one-shot Phase A batch run.

## Pre-dispatch SDK binary preflight
- **Before consuming a `vp-dev run` gate token on a fresh shell or after `npm ci`, run `node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude --version` (the glibc artifact) to confirm the agent SDK can actually launch its native binary.** A failed binary load surfaces as the misleading "Claude Code native binary not found at .../claude-agent-sdk-linux-x64-musl/claude" — the binary IS present but its musl loader (`/lib/ld-musl-x86_64.so.1`) doesn't exist on glibc hosts.
- **Tells**: fresh `npm ci` on Ubuntu / Debian / Fedora / RHEL (glibc); SDK error mentions `linux-x64-musl/claude`; exit comes before any agent reads issue content.
- **How to apply**: if `--version` errors with `cannot execute: required file not found`, set `VP_DEV_CLAUDE_BIN=$PWD/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude` (or the `-musl` variant on Alpine) and re-run. The cost of skipping this check isn't API tokens — those are $0 because no agent boots — it's the post-mortem fanout, which then needs `--include-non-ready` or per-issue resolution comments to clear. Becomes obsolete once `claudeBinPath()` auto-detects libc ([#251](https://github.com/szhygulin/vaultpilot-dev-framework/issues/251)).

## Re-dispatch discipline: check for salvageable partial work first
- **Before re-dispatching a failed issue, run `git ls-remote origin 'refs/heads/vp-dev/*-incomplete-*' | grep "issue-<N>-incomplete"`.** PR [#92](https://github.com/szhygulin/vaultpilot-dev-framework/pull/92)'s safety net pushes partial worktree edits to `vp-dev/<agent>/issue-<N>-incomplete-<runId>` on any non-clean exit. The work is often >90% complete — agents typically run out of budget at the closing sequence (build/commit/push/PR), not at the implementation step.
- **How to apply**: when an `-incomplete-` ref exists, salvage by hand instead of re-dispatching from main. Recipe: `git worktree add .claude/worktrees/salvage-<N> -b vp-dev/<agent>/issue-<N> origin/<incomplete-ref>` (note: drop the `-incomplete-<runId>` suffix so the new branch name matches `VP_DEV_BRANCH_RE` and PR [#74](https://github.com/szhygulin/vaultpilot-dev-framework/pull/74)'s open-PR sweep recognizes it), then `git rebase origin/main`, run typecheck/build/test, fix any small gaps, amend the salvage commit to a clean conventional-commit message, push, open PR with `Closes #N`.
- **Hand-salvage PRs must mirror the agent signature convention with the originating agent's identity** (issue #129). When the operator opens a PR for salvaged work that no agent finished via `gh pr create`, end the PR body with a single line: `— <Name> (<agent-id>, salvaged from <runId> by operator)`. Example: `— Alonzo (agent-92ff, salvaged from run-2026-05-05T11-30-15-426Z by operator)`. This preserves the durable cross-reference between merged work and the agent that did it — without the line, post-hoc `gh pr list --search 'in:body "agent-XXXX"'` audits miss the salvage PR. Resumed runs via `--resume-incomplete` get this for free: the workflow prompt instructs the resuming agent to add a co-signature line naming the originating agent above its own.

## Per-agent `CLAUDE.md` grows from successful runs
After every successful issue-resolution run, a separate sonnet summarizer rewrites `agents/<agent-id>/CLAUDE.md` to fold in lessons from the run. The file is gitignored — local-only memory.
- Hand-editing `agents/<agent-id>/CLAUDE.md` between runs is allowed (e.g. trimming bloat, removing stale entries) but the summarizer **overwrites it** on the next successful run, so changes are short-lived.
- **Don't load-bear on per-agent CLAUDE.md content for correctness.** The agent's invariants must come from its prompt + tooling, not from a memory file the summarizer can rewrite.
- The auto-generated `agents/agent-90e4/CLAUDE.md` etc. are derivative copies of the target repo's seed — their staleness reflects the target's pre-summary state. Don't treat them as authoritative for the target repo's current rules.

## Mid-flight progress-checking: `vp-dev status` is the canonical tool
- **For "how is the run going?" questions, use `vp-dev status` (no args) — never `pgrep` + `ls -lt logs/`.** The no-args path reads `state/current-run.txt`, finds the active run, and renders the canonical block (totals, in-flight, last activity, recent events). Live tail: `vp-dev status --watch`. Inspect a specific run by id (positional arg) or use `--latest` for the most recent on disk regardless of completion. The launch-time breadcrumb in `vp-dev run` (#157) prints these commands once per run; this rule is the same affordance for fresh agents that didn't see the launch output.
- Don't tail the JSONL (`logs/<runId>.jsonl`) for progress unless the formatter doesn't surface the field you want — it's write-rate-limited and the canonical formatter already reads it (`tryLoadRunActivity`). Past incident 2026-05-05: a status check ran `pgrep` + `ls -lt` + `vp-dev status <runId>` (failed: positional arg expects bare runId, not the file path) + `--help` before landing on `--latest`. Right answer all along was `vp-dev status` no-args.

## CI is a hard gate
`.github/workflows/ci.yml` runs `npm ci && npm run typecheck && npm run build` on every push and PR. All three must pass. CI failures block merges; reproduce locally with the same three commands before pushing if a PR is failing for unclear reasons.

## Agent overload remediation: pick the right axis
- **`split`, `compact-claude-md`, and `prune-tags` (#219) address distinct overload axes.** Picking the wrong tool wastes a round trip; an agent flagged for "tags=72 >= 50" doesn't need its CLAUDE.md compacted, and an agent with a 50KB CLAUDE.md doesn't need its tags pruned.
- **Decision matrix** when an agent trips an overload threshold:
  - `CLAUDE.md ≥ 30KB` AND `attributableSections ≥ 4` → `agents split` (carve into 2-3 sub-specialists).
  - `CLAUDE.md ≥ 30KB` AND `attributableSections ≥ 3 per cluster` (but < 4 total) → `agents compact-claude-md` (merge near-duplicate sections in place).
  - `tags ≥ 50` AND `attributableSections < 4` (split-blocked) → `agents prune-tags` (drop registry tags not backed by any section, optionally LLM-generalize survivors). Most relevant when `tag-to-section ratio > 5:1` — the registry has accumulated breadth from `memoryUpdate.addTags` envelopes that didn't land kept lessons.
  - `issuesHandled ≥ 20` alone with all three `CLAUDE.md`/`tags`/`sections` axes healthy: informational only — no remediation, the agent is producing focused work at scale.
- **Composition order**: when ≥2 axes trip, prune-tags first (cheapest, deterministic Phase 1), then re-evaluate. Pruning may bring the agent under the split threshold and unblock a cleaner subsequent split.

## CLI tools: smoke-test the empty-result path before merging
- **Before merging a new `vp-dev agents <subcommand>` (or any `vp-dev <verb>`), smoke-test it against a fixture that produces an EMPTY result, not just a populated one.** Empty-result paths often take distinct code (default values, no-op shortcuts, fallback expressions, `Math.min(...[]) === Infinity`) that the populated-result tests don't exercise.
- **How to apply**: build a synthetic fixture with zero eligible items (empty `state/lesson-utility-<id>.json`, empty registry, no PRs, etc.), invoke the CLI in advisory mode, and read the output. If the rendered text contains nonsense (`Infinity`, `undefined`, `NaN`, empty `[]` where a default should have been substituted), that's a real bug regardless of whether unit tests pass.

## Research-tool regression methodology: AIC sweep + leave-out-outliers before declaring "no signal"
- **When an OLS regression in `src/research/curveStudy/` returns p > 0.05, run an AIC sweep across alternative model forms AND a leave-out-N-outliers refit before declaring "no signal".** A specific outlier or two can absorb most of the residual variance and mask a real signal underneath the wrong model form. The right model form may also be one fewer parameter than the default (lower-degree polynomial, or a transformed x like log(x)) — better fit AND fewer params is the dominant move when both are possible.
- **What to sweep**: at minimum {linear-raw, linear-log(x), poly2-raw, poly2-log(x)}. Compute AIC = `n·ln(rss/n) + 2(degree+1)` per fit; convention is ΔAIC < 2 = "indistinguishable evidence", ΔAIC > 2 = meaningful preference. Pick the lowest AIC; on ties, pick the simpler form (fewer parameters).
- **Leave-out-outliers**: rank training samples by `|residual|`, drop the top 1-2, refit, recompute p. If p crashes by >1 order of magnitude (e.g., 0.1 → 0.001) the signal IS real and the outliers are absorbing variance — name them, investigate why they're outliers (specific seed family? specific issue type?), don't average them out without understanding.

## Lessons-learned discipline fires on `vp-dev` runs too
The global **Post-PR Lessons-Learned Discipline** rule fires after opening a PR. In this repo, also apply it after every `vp-dev` invocation that probes tool behavior — both dry-runs (`--dry-run`) and actual executions of development sessions. Each run exercises the orchestrator end-to-end (approval gate, push-protection layers, agent isolation, summarizer, target-repo seeding) and surfaces patterns that code review alone won't catch.
- **Split bugs from lessons before applying the candidate framework.** `vp-dev` runs surface two distinct buckets: (a) bugs / design defects in the harness (gate over-restrictions, summarizer schema-invalid crashes, orchestrator dispatch quirks, missing logging) → propose fixes or file issues against this repo, do NOT run through contradiction + context-cost analysis; (b) genuine process habits / meta-skills → run through the 2-global + 2-local candidate framework per the global rule. Output the two buckets as separate sections.
- Format for the lessons bucket: same as the global rule — 2 global candidates + 2 local candidates, ranked, with contradiction check + context-cost analysis per candidate.
- Skip when: the run was a pure repro of unchanged config, or nothing non-trivial surfaced (clean dry-run that matched expectations).
- Apply when: a new failure mode appeared, the gate / push-protection / approval flow behaved unexpectedly, an agent boundary leaked, the summarizer produced a surprise, or the user pushed back on framing.
- Local-scope lessons land in this `CLAUDE.md` bundled into the same PR as the work that triggered them; global-scope lessons go to `~/.claude/CLAUDE.md` as a separate commit in the `claude-md-global` repo.
