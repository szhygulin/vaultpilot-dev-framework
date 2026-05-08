## Tool Usage Discipline
- Don't repeat the same informational tool call within a single turn — cache mentally.
- Ambiguous / empty result: verify once with a different method; don't loop without user consent.

## Security Incident Response Tone
- Diagnose malware/compromise with evidence-based scoping before recommending destructive actions (wipe, nuke, rotate-all). Never delete evidence files before reading them.

## Chat Output Formatting
- Markdown hyperlinks over raw URLs everywhere: `[label](url)`. Long URLs (swiss-knife decoders, Etherscan tx, tenderly/phalcon simulations) wrap the terminal into unreadable walls when raw. Apply in user replies AND in any text the server tells the agent to render. Raw URLs OK only when short and scannable (bare domains) or required for machine-readable JSON paste-blocks.

## Push-Back Discipline
- **Push back BEFORE acting if the request is built on a faulty premise that won't achieve the user's stated goal.** Mid-response caveats ("won't actually fix the thing you asked for") prove the wrong action got taken.
- Tells: re-running a workflow on a tag that predates the fix; re-broadcasting a tx with a confirmed nonce; wrapping a destructive action with "won't really do what you want, but doing it anyway".
- Format: one sentence on the mismatch + 2-3 alternatives + a question. Short — unblock the decision, don't lecture.
- If the user says "do it anyway", proceed.
- Past incident 2026-04-27: user asked to retrigger release-binaries.yml on the v0.9.4 tag for a missing macos-arm64 upload; tag predated #346 / #349 / #361 (size + retry fixes). Right move was flag the frozen-tag problem and recommend cutting v0.9.5.

## Smallest-Solution Discipline
- **Push back with the smallest solution that solves the stated problem.** Minimum change first; escalate only if it demonstrably doesn't cover the requirement. Issue/plan text is a problem description, not a license to build infrastructure.
- Tells the proposal is too big: persistence layer for a one-shot operation; new module when an inline call-site change would do; background worker/scheduler for an action that fires once per request; generalizing for hypothetical future callers; "while I'm here" refactors bundled into a fix PR.
- Format: smallest fix + what the larger proposal adds + which scope to pursue. If the issue/plan author specified the heavy approach, surface the lighter one explicitly — don't silently downscope either.
- If the user says the larger scope is intended, proceed.

## Write audit-trail companion fields atomically with the state-transition flag that triggers them

**When a mutation flips a boolean state flag (`archived`, `completed`, `deleted`, etc.), always write every companion audit field (`archivedAt`, `splitInto`, `reason`, related-ID arrays) in the exact same transaction or mutation block — never leave them for a follow-up write.**

**Why:** A flag-only write creates a permanently incomplete audit trail: the registry can answer 'was this archived?' but not 'when?' or 'into what?'. Backfilling after the fact is lossy and the gap is invisible until a consumer tries to query the companion fields.

**How to apply:** Before closing any state-transition mutation, scan the target schema for fields named `*At`, `*By`, `*Into`, `*From`, `*Reason`, or sibling ID arrays. If the flag is being set but its companions are not, extend the same mutation to include them.

**Tells:** A schema has a boolean like `archived?: boolean` next to `archivedAt?: string` or `splitInto?: string[]`. Only the boolean is being written. The companion fields are either missing from the schema entirely or present but never populated.

**Also:** Issue descriptions may misstate the current schema — always read the actual source files before assuming fields exist. Add missing fields as optional (`?`) to preserve back-compat with pre-transition records already in the registry.

<!-- run:run-2026-05-05T11-30-15-426Z issue:#102 outcome:implement ts:2026-05-05T11:41:20.005Z tags:cli-subcommand,file-lock,lesson-curation,llm-call,pool-trim,shared-lessons -->
## Verify the authoritative type file before editing the path named in an issue body

**When an issue body names a specific file for a schema or interface change, search for the actual type/interface definition before editing — the named file may only import and consume the type.** The authoritative definition may live elsewhere (e.g., `types.ts` vs. a domain-specific state file).
**Why:** Issue bodies are written at planning time and can lag behind refactors; `RunState` was described as living in `src/state/runState.ts` but was actually defined in `src/types.ts` — editing the consumer file would have left the interface unchanged.
**How to apply:** On every schema-extension or interface-addition task, grep or use `go-to-definition` for the type name before writing any edit. Edit only the file that _declares_ the type; files that merely import it need no change.
**Tells:** Issue body cites a concrete file path for a type/interface change; codebase has both a `types.ts` and domain-specific state/schema files; the named file imports from `types.ts`.

<!-- promote-candidate:schema-extension -->
Issue bodies naming a concrete file for a type/interface change can lag behind refactors. In this codebase, `RunState` was described as living in `src/state/runState.ts` but was actually defined in `src/types.ts`; `runState.ts` only imported and consumed it. Editing the consumer file would have left the interface unchanged. Searching for the actual type definition before any schema-extension edit is the reliable approach.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T20-22-10-610Z issue:#158 outcome:pushback ts:2026-05-05T20:25:42.364Z tags:advisory-vs-mutation-seam,agent-memory-growth,best-architectural-solution-discipline,claude-md-compaction,mechanism-ambiguity,phased-split,pre-dispatch-triage,scope-fit-check,splitter-section-floor -->
