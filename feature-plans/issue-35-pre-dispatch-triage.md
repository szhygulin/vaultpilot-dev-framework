# Plan: pre-dispatch issue triage to filter not-ready issues

Tracks [#35](https://github.com/szhygulin/vaultpilot-dev-framework/issues/35).

## Context

Some GitHub issues are not ready for a coding agent: discussion-only ("we should think about X"), ambiguous scope, duplicates of an open issue, or body/comments disagree on scope (per CLAUDE.md's Issue Analysis rule). Dispatching a coding agent at these wastes a run.

A cheap haiku call before the approval gate, surfaced in the gate text, lets the user accept the filter or override.

## Approach

### Triage module

New file `src/orchestrator/triage.ts`:

```ts
export type TriageResult = {
  ready: boolean;
  reason: string;          // one-line, surfaces in approval gate
  suggestedSpecialty?: string;
};

export async function triageIssue(opts: {
  issue: IssueSummary;
  comments: IssueComment[];
  cache: TriageCache;
}): Promise<TriageResult>;
```

Model: `claude-haiku-4-5-20251001`. Single response, JSON output. Prompt rubric:

- **Ready**: concrete bug with repro, or feature with explicit acceptance criteria.
- **Not ready — ambiguous**: "we should think about" / "explore" / no acceptance criteria.
- **Not ready — duplicate**: cross-reference with other open issues; if substantive overlap, mark dup.
- **Not ready — body/comments conflict**: body and recent comments disagree on scope.

### Cache

`state/triage/<issue#>.json`, keyed on `(issue#, sha256(body + comments-concat))` so re-runs short-circuit when nothing changed:

```jsonc
{
  "issueNumber": 162,
  "contentHash": "sha256:abc...",
  "result": { "ready": true, "reason": "concrete bug, repro included" },
  "triagedAt": "2026-05-02T12:00:00Z"
}
```

The cache is gitignored (under `state/`, already gitignored).

### Integration in `cmdRun()`

In `src/cli.ts`'s `cmdRun()`, between `resolveRangeToIssues()` and `buildSetupPreview()`:

```ts
const triageResults = await triageBatch(openIssues, cache);
const readyIssues = triageResults.filter(r => r.ready).map(r => r.issue);
const skippedIssues = triageResults.filter(r => !r.ready);
```

Pass both lists to `buildSetupPreview()`.

### Approval gate surface

Extend `SetupPreview` in `src/orchestrator/setup.ts`:

```ts
type SetupPreview = {
  // existing fields ...
  skippedIssues: { issue: IssueSummary; reason: string }[];
};
```

`formatSetupPreview()` adds a section:

```
3 issues skipped by triage:
  #443 — ambiguous scope: "we should think about caching"
  #471 — duplicate of #468
  #482 — body/comments conflict on scope
Override with --include-non-ready.
```

### Override flag

`--include-non-ready` in `src/cli.ts`. Per-run flag only, no env var — should be a deliberate decision each time.

### Fail-open on triage error

If the haiku call errors transiently, default to `ready: true` for that issue. The approval gate is the backstop. Log the error but do not abort the run.

### Cost surfacing

The cost of triage (1 haiku call per issue, even cached calls return `cost: 0`) is added to the projected-cost line in the gate so the user sees `triage: $X + dispatch: $Y = total $Z`.

## Critical files & integration points

- `src/orchestrator/triage.ts` — new module.
- `src/cli.ts` — `cmdRun()` invokes `triageBatch()` between range resolution and setup preview; new `--include-non-ready` flag.
- `src/orchestrator/setup.ts` — `SetupPreview` extended; `formatSetupPreview()` prints skipped section; `buildSetupPreview()` takes ready/skipped split.
- `src/github/gh.ts` — needs an `issueComments(repo, issueNumber)` helper if not already present (used to fetch comments for the triage rubric).
- `state/triage/` — new gitignored directory under existing `state/` tree.
- `src/agent/costTracker.ts` (from #34, if landed) — triage cost feeds the same tracker.

## Verification

- Unit test: an obviously ambiguous issue body ("we should think about caching") returns `ready: false`.
- Unit test: a concrete bug body returns `ready: true`.
- Integration test: re-running triage on the same `(issue#, contentHash)` short-circuits — no new haiku call.
- Integration test: `--include-non-ready` overrides the filter; all originally-skipped issues appear in the dispatched set.
- Integration test: simulate a haiku transport error → triage returns `ready: true` for the failing issue, run proceeds.
- Setup preview shows the skipped section with reasons.

## Out of scope

- Writing triage results back to GitHub as comments ("needs more detail").
- Triage of issues outside the requested range.
- LLM-driven dup detection beyond the in-batch issues — substantive cross-issue dup detection is its own problem.
- Re-triage on cache hit when comments have new posts but body unchanged — the content hash includes comments, so this is covered automatically.
