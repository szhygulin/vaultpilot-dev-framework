# Plan: failure-driven learning — extend summarizer to fire on terminal failure

Tracks [#32](https://github.com/szhygulin/vaultpilot-dev-framework/issues/32).

## Context

`src/agent/summarizer.ts` rewrites `agents/<id>/CLAUDE.md` only on successful runs. Failures — CI red after retry, PR closed unmerged, reviewer churn ≥ N rounds, agent gave up — carry the highest-signal lessons (what didn't work, what assumption broke, what tooling gap surfaced) and today they're discarded. A specialist with 60% merge-rate has 40% of its potential learning sitting on the floor.

## Approach

### Failure classification

Distinguish genuine failures from infra flakes at the call site in `src/agent/runIssueCore.ts` (lines 84–125, where the summarizer fires today on success).

Genuine failure (run summarizer with failure prompt):
- Envelope `decision === "error"` with a non-empty `error` field.
- Envelope `decision === "implement"` but workflow exit reports CI red after retries exhausted.
- Envelope `decision === "pushback"` with a content classification of "agent gave up" (look for "I cannot" / "unable to determine").

Infra flake (skip summarizer entirely):
- SDK transport error (ECONNRESET, abort, timeout) — caught upstream in `codingAgent.ts`.
- GitHub API 5xx surfaced via `src/github/gh.ts`.
- Worktree creation failure (filesystem-level).

### Failure-mode summarizer prompt

Extend `src/agent/summarizer.ts` with a second exported entry point:

```ts
export async function summarizeFailure(input: {
  agentId: string;
  issueId: number;
  envelope: ParsedEnvelope;
  errorContext: string;
  priorClaudeMd: string;
}): Promise<{ updatedClaudeMd: string }>;
```

Prompt shape:
- "What did the agent assume that turned out wrong?"
- "What context or tooling was missing?"
- "What guard rule, written tersely, would have prevented this?"

Output gets prepended to `agents/<id>/CLAUDE.md` with sentinel:

```markdown
<!-- failure-lesson:run-<runId> -->
<lesson body>
<!-- /failure-lesson -->
```

The sentinel enables a separate prune cadence later (auto-expire after K subsequent successes) without affecting success-derived content.

### Integration in runIssueCore.ts

Inside `runIssueCore()` post-processing (current lines 84–125 fire `summarize()` only on success), add a sibling branch:

```ts
if (terminalState === "failed" && !isInfraFlake(error)) {
  await summarizeFailure({ ... });
} else if (terminalState === "succeeded") {
  await summarize({ ... });   // existing path
}
// flakes: write nothing
```

`isInfraFlake()` is a small helper, also exported from `src/agent/summarizer.ts`, that pattern-matches error strings.

## Critical files & integration points

- `src/agent/summarizer.ts` — add `summarizeFailure()` export and `isInfraFlake()` helper. Existing `summarize()` unchanged.
- `src/agent/runIssueCore.ts` — branch on terminal state at the existing summarizer fire-point (lines 84–125).
- `src/agent/parseResult.ts` — `extractEnvelope()` shape provides `decision`, `error` fields the classifier reads.
- `src/agent/prompt.ts` / `buildAgentSystemPrompt()` — no change; failure lessons land in the same `agents/<id>/CLAUDE.md` file already read on the next run.
- `src/types.ts` — no change required; `IssueStatus` already has `"failed"`.

## Verification

- Unit test `isInfraFlake()` against representative error strings (transport, GitHub 5xx, filesystem) → all classify as flake.
- Unit test `summarizeFailure()` with a stub envelope → returns updated CLAUDE.md with the sentinel-wrapped block prepended.
- Integration: simulate a failed run by injecting `decision: "error"` into the envelope; confirm `agents/<id>/CLAUDE.md` gains a `<!-- failure-lesson -->` block; success runs in the same test suite still trigger the existing path.
- Confirm flakes write nothing: inject a transport error, assert `agents/<id>/CLAUDE.md` is unchanged.

## Out of scope

- Auto-expire after K successes — sentinel enables it; implement in a follow-up if signal warrants.
- Multi-failure aggregation ("3 similar failures across runs" → stronger lesson) — premature without observed signal.
- Target-repo modifications (this writes only the agent's local memory).
- Cross-agent failure sharing — covered by #33.
- Reading reviewer-rework cycles as a failure signal — depends on #36.
