# Plan: planning mode — Opus plans complex issues while small issues dispatch in parallel

Tracks [#38](https://github.com/szhygulin/vaultpilot-development-agents/issues/38).

## Context

Coding agents today receive only the issue body, target-repo CLAUDE.md, and their own evolved CLAUDE.md as seed. Complex issues — multi-file refactors, design choices with multiple viable shapes, integrations that thread through several call sites — benefit from an explicit written plan before code starts. Trivial issues (typo fix, dependency bump, single-line bug) do not, and forcing a plan step on them adds latency and cost for no gain.

This is the workflow the team just used in conversation: an Opus agent writes plans for complex issues to `feature-plans/issue-<N>-<slug>.md`, references the file from the issue body, and coding agents pick up that file as part of their seed. Small issues skip planning. Both flows run in parallel.

## Approach

### The convention

Every issue body has a `## Plan` section in one of two shapes:

```markdown
## Plan

[feature-plans/issue-<N>-<slug>.md](feature-plans/issue-<N>-<slug>.md)
```

```markdown
## Plan

Not needed — coding agent can start directly from the issue body.
```

Coding agents key off this section. Plan-mode infrastructure writes it; humans can write it manually too.

### Workflow

1. **Complexity gate** — cheap haiku call per issue returning `{ needsPlan: bool, reason: string }`. Folds with #35 triage if both land (same call, two flags).
2. **Planning branch** — issues with `needsPlan: true` enter status `"planning"`. The Opus planner (`src/agent/planner.ts`, model `claude-opus-4-7`) reads issue body + comments + target repo's CLAUDE.md + recent commits in relevant areas, then writes `feature-plans/issue-<N>-<slug>.md` and `gh issue edit`s the body to append the `## Plan` link. Status transitions to `"pending"`.
3. **Direct branch** — issues with `needsPlan: false` skip planning; the gate appends the "Not needed" sentinel to the issue body and the issue stays at `"pending"`.
4. **Dispatch loop** — unchanged; picks `pending` issues only, never `planning`. Dispatch and planning run in parallel because `runOrchestrator()` is already async-per-issue.
5. **Coding agent seed** — `buildAgentSystemPrompt()` parses the `## Plan` section; if a file is linked, its content is appended to the seed.

### Implementation — file-by-file

#### `src/agent/planner.ts` (new)

```ts
export type PlanResult = {
  needsPlan: boolean;
  planPath?: string;       // feature-plans/issue-<N>-<slug>.md, set when needsPlan
  reason: string;
};

export async function classifyComplexity(issue: IssueSummary, comments: IssueComment[]): Promise<{ needsPlan: boolean; reason: string }>;

export async function generatePlan(opts: {
  issue: IssueSummary;
  comments: IssueComment[];
  targetRepoPath: string;
  targetRepoClaudeMd: string;
}): Promise<{ planPath: string; planContent: string }>;
```

`classifyComplexity` uses `claude-haiku-4-5-20251001`. Rubric:
- Multi-file change spanning ≥3 files OR multiple modules → needs plan.
- New module / new abstraction / cross-cutting integration → needs plan.
- New external dependency / SDK adoption → needs plan.
- Single-file fix / typo / dep bump / one-line behavior tweak → no plan.

`generatePlan` uses `claude-opus-4-7`. Output template matches the format of plan files in this PR (Context / Approach / Critical files / Verification / Out of scope).

#### `src/agent/planner.ts` — plan-file writing & issue-body editing

After plan content is generated:
1. Slug from issue title (kebab-case, ≤6 words).
2. Write `feature-plans/issue-<N>-<slug>.md` in the worktree.
3. `gh issue view <N> --json body -q .body` → append `## Plan` section → `gh issue edit <N> --body-file -`.
4. Commit + push the plan file on the orchestrator's branch (or the per-agent branch — design decision below).

**Branch question**: where do plan files live during a run?
- Option A: orchestrator commits plan files to the target repo's default branch directly (requires push permission to default branch — violates push-protection layers per CLAUDE.md).
- **Option B (chosen)**: plan files commit to the planning agent's own feature branch alongside any other changes. Coding agents reading the plan from the issue body's link will see the file once that branch lands. For pre-merge access, the coding agent reads `feature-plans/<file>` from its own worktree (which branched off the same base). Synchronization detail: planner runs first on the target repo, opens its plan-PR; coding agents wait for plan-PR merge before dispatching. Or, the plan file is written to a shared `feature-plans/` location read out-of-band (no commit required during the run — the file lives in `state/plans/<run>/issue-<N>-<slug>.md` AND gets persisted to the target repo as a follow-up PR).
- **Final design**: write plan to `state/plans/<runId>/issue-<N>-<slug>.md` for in-run consumption; the planner ALSO opens a plan-PR in the target repo with the same content under `feature-plans/`. Coding agents read from the in-run state path during dispatch; humans read the merged file for context. Decouples in-run read from PR-merge timing.

#### `src/types.ts`

Extend `IssueStatus`:

```ts
export type IssueStatus = "pending" | "planning" | "in-flight" | "done" | "failed";
```

Add `planPath?: string` to `RunIssueEntry` for runtime plan reference.

#### `src/state/runState.ts`

New helper `markPlanning(runState, issueId)` parallel to `markInFlight()`. Transition `planning → pending` happens at planner completion via direct mutation + `saveState()`.

#### `src/orchestrator/orchestrator.ts`

`runOrchestrator()` gains a parallel branch alongside the existing dispatch loop:

```ts
// At each tick:
const planningQueue = state.issues.filter(i => i.status === "pending" && needsPlan(i));
const directQueue = state.issues.filter(i => i.status === "pending" && !needsPlan(i));

// Fire planner for planning queue (Opus, parallel slot pool separate from dispatch)
// Fire dispatcher for direct queue (existing path, unchanged)
```

Planning has its own `inFlightPlanning` Map, parallel to `inFlight`. Both Maps drain via `Promise.race(...)` selecting whichever resolves first.

#### `src/agent/prompt.ts`

`buildAgentSystemPrompt()` reads the issue's `planPath` from `RunIssueEntry`:

```ts
if (issueEntry.planPath) {
  const planContent = await readFile(issueEntry.planPath, "utf8");
  promptParts.push(`## Plan\n\n${planContent}`);
}
```

Append between agent CLAUDE.md and rendered workflow.

#### `src/orchestrator/setup.ts`

`SetupPreview` extended:

```ts
type SetupPreview = {
  // existing fields ...
  planningCount: number;       // issues that will go through Opus planning
  directDispatchCount: number; // issues that skip planning
  estimatedPlanningCostUsd: number;
};
```

`formatSetupPreview()` adds:

```
3 issues will be planned (Opus, ~$0.45)
12 issues dispatch directly (Sonnet, ~$2.10)
```

User can refuse at the gate.

#### `src/cli.ts`

New subcommand:

```
vp-dev plan <issue#>             # ad-hoc plan generation, outside a run
vp-dev plan <issue#> --no-edit   # write plan file but don't edit issue body
```

Existing `vp-dev run` invokes the planner automatically per the complexity gate.

### Boundary preservation

- Coding agents NEVER write plan files. The planner is its own module, runs in the orchestrator process.
- Coding agents READ plan files only — from `state/plans/<runId>/...` during dispatch, from the merged `feature-plans/` for human review.

## Critical files & integration points

- `src/agent/planner.ts` — new: complexity classification + Opus plan generation + issue body edit.
- `src/orchestrator/orchestrator.ts` — `runOrchestrator()` gains the parallel planning branch.
- `src/agent/prompt.ts` — `buildAgentSystemPrompt()` injects plan content from `issueEntry.planPath`.
- `src/types.ts` — extend `IssueStatus` with `"planning"`; add `planPath?` to `RunIssueEntry`.
- `src/state/runState.ts` — `markPlanning()` helper.
- `src/orchestrator/setup.ts` — `SetupPreview` extended with planning count + cost; `formatSetupPreview()` displays both.
- `src/cli.ts` — `vp-dev plan` subcommand; complexity gate invocation in `cmdRun()`.
- `src/github/gh.ts` — `gh issue edit` wrapper if not present.
- `state/plans/<runId>/` — new directory under `state/`, gitignored.
- `feature-plans/` — TARGET repo path where the planner opens a plan-PR; tracked.
- `src/orchestrator/triage.ts` (from #35, if landed) — fold complexity gate into the same haiku call.

## Verification

- Unit test `classifyComplexity()` against canonical fixtures: a typo fix returns `needsPlan: false`; a multi-file refactor returns `needsPlan: true`.
- Integration test: dry-run on a complex fixture issue produces `state/plans/<runId>/issue-<N>-<slug>.md` and updates the issue body via `gh issue edit`.
- Integration test: dry-run on a trivial issue appends "Not needed" sentinel to the issue body, no plan file created.
- Integration test: a coding agent dispatched against an issue with a `planPath` shows the plan content in its prompt log.
- Integration test: planning and dispatch run in parallel — start a 5-issue run with 2 planning + 3 direct; assert both `inFlight` Maps populate before either drains.
- Approval gate displays the planning vs. direct split with cost breakdown.

## Out of scope

- Regenerating plans on PR-review feedback.
- Plan revision when coding agent finds the plan wrong on contact with code (default: agent leaves a comment on the issue noting divergence; human re-plans manually).
- Plan staleness detection (plan-generated-at vs issue-updated-at).
- Multi-step plan execution / one-plan-many-PRs (one plan, one PR).
- Recursive planning (plans for sub-tasks within a plan).
- Plans for issues outside the requested range.
- Auto-applying the planner output as a code-PR (planner outputs ONLY the plan markdown).
