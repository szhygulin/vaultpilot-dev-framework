# Plan: cross-agent shared lessons pool with curated promotion

Tracks [#33](https://github.com/szhygulin/vaultpilot-dev-framework/issues/33).

## Context

Each `agents/<id>/CLAUDE.md` is fully isolated per CLAUDE.md's "cross-agent writes corrupt parallel runs" rule. The boundary is correct for the WRITE path — agents must never reach into a sibling's directory. But the rule also blocks the READ path, so the same domain knowledge gets rediscovered N times across siblings (Solana RPC quirks, ERC-4626 semantics, ethers v5/v6 API drift).

Today the only shared seed is the target repo's CLAUDE.md. That covers project-wide rules; it does not cover specialty knowledge that emerges from running.

Solution: curated, read-only-at-runtime shared pool with the cross-agent boundary intact.

## Approach

### Layout

```
agents/.shared/lessons/<domain>.md
```

Gitignored — local memory, identical scope to `agents/`. One file per domain. Domain taxonomy is the existing specialty taxonomy from `src/agent/specialization.ts` — do not introduce a second one.

### Read path (agent prompt seeding)

In `src/agent/prompt.ts`'s `buildAgentSystemPrompt()`, after the agent's own CLAUDE.md is loaded:

1. Identify the agent's primary domain via the existing tag-to-specialty resolver in `src/agent/specialization.ts`.
2. Load `agents/.shared/lessons/<domain>.md` if it exists.
3. Append between the agent CLAUDE.md and the rendered workflow, under a heading `## Shared lessons (<domain>)` so it's distinguishable in the seed.

If the domain has no pool file, skip silently. No error.

### Write path (curated promotion — orchestrator-side only)

The cross-agent boundary holds because pool writes happen in the orchestrator process, never in an agent's tool calls.

1. **Tagging at summarize-time**: extend `src/agent/summarizer.ts` to tag candidate lessons during the existing summarizer pass. The summarizer is told: "If this lesson would help a sibling agent in the same domain, wrap it in `<!-- promote-candidate:<domain> -->...<!-- /promote-candidate -->`."
2. **Review CLI**: new `vp-dev lessons review` subcommand in `src/cli.ts`. Walks all `agents/<id>/CLAUDE.md` for `<!-- promote-candidate -->` blocks. For each: shows the block, the source agent, the proposed domain. User picks `accept | edit | reject | skip`.
3. **Apply on accept**: orchestrator process appends accepted lessons to `agents/.shared/lessons/<domain>.md`. Removes the `<!-- promote-candidate -->` wrapping in the source CLAUDE.md (replaces with `<!-- promoted:<domain>:<ts> -->`).
4. **Apply on reject**: replaces `<!-- promote-candidate -->` wrapping with `<!-- not-promoted:<reason>:<ts> -->`.

### Pool size cap

Each `agents/.shared/lessons/<domain>.md` capped at ~200 lines. On accept-when-full, CLI rejects with: "Pool full. Run `vp-dev lessons trim <domain>` first." (Trim CLI deferred — manual editing works for now.)

### Boundary preservation — explicit checks

- Coding agents NEVER write to `agents/.shared/`. The directory is read-only from a coding agent's perspective. Add this to the workflow text in `src/agent/workflow.ts` explicitly.
- The orchestrator process writes via the review CLI only. No tick-time auto-promotion.

## Critical files & integration points

- `src/agent/prompt.ts` — `buildAgentSystemPrompt()` extended to read pool file.
- `src/agent/specialization.ts` — domain taxonomy resolver (must already expose a "primary domain" for an agent's tag set, or extend it to).
- `src/agent/summarizer.ts` — extended prompt to tag promotion candidates.
- `src/agent/workflow.ts` — `renderWorkflow()` adds an explicit "do not write to agents/.shared/" guard rail.
- `src/cli.ts` — new `vp-dev lessons review` (and `vp-dev lessons list`) subcommand.
- `.gitignore` — confirm `agents/` already excludes `agents/.shared/` (it does, since `agents/` is gitignored wholesale).

## Verification

- Unit test: a CLAUDE.md with a `<!-- promote-candidate:solana -->` block surfaces in `vp-dev lessons review` listing.
- Integration test: `accept` on a candidate appends to `agents/.shared/lessons/solana.md`, replaces source wrapping with `<!-- promoted -->`.
- Integration test: a fresh dispatch in the `solana` domain shows the pool content in the prompt log (assert via captured prompt in dry-run).
- Boundary check: dispatch a coding agent against a sandbox; assert it cannot write to `agents/.shared/` (filesystem ACL or `disallowedTools` on the path).
- Pool cap: a 201st line on accept rejects with the trim instruction; pool file is unchanged.

## Out of scope

- Cross-target-repo lesson sharing — different blast radius, separate issue.
- Auto-promotion without human gate — defeats the boundary.
- LLM-driven trim — manual editing first.
- Failure-derived candidates from #32 — the same tagging mechanism works for both, but ship #32 first to confirm the failure-summary path is stable before promoting from it.
