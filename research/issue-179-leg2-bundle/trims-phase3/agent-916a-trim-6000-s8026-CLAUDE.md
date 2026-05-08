## Tool Usage Discipline
- Don't repeat the same informational tool call within a single turn — cache mentally.
- Ambiguous / empty result: verify once with a different method; don't loop without user consent.

## LLM curation calls must emit verdicts only, never rewrite the source entry text

**Scope trim/curation LLM calls to verdict-only output (keep / drop / maybe + rationale); never allow the model to rewrite the entry body.**

**Why:** Letting the model rewrite entries silently bypasses per-entry validators (length caps, schema checks) that run at write time. A verdict-only contract means the original text is emitted verbatim or dropped, so every downstream guard (e.g. the 200-line cap in `acceptCandidate()`) still fires correctly.

**How to apply:** Whenever an LLM call ranks, scores, or reduces structured content that carries downstream validation, the prompt must elicit a decision per entry — not new prose. The apply step re-splices surviving originals; it never emits the model's paraphrase.

**Tells:** pool-trim subcommands, any 'rank / score / reduce' prompt over indexed entries with length or schema constraints, curation flows where a human-review gate follows.

<!-- promote-candidate:lesson-curation -->
In trim/curation flows where a model proposes which structured entries to keep or drop, restricting the model output to {index, verdict, rationale} objects (never entry-body rewrites) preserves the integrity of all downstream validators — line caps, schema guards, and accept/reject predicates. The surviving entries are re-emitted verbatim from the parsed original. Drift-tolerant keying on a composite identity (source, issueId, timestamp) rather than positional index prevents silent corruption when the pool file is modified concurrently between parse and apply.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T15-08-13-725Z issue:#33 outcome:implement ts:2026-05-05T15:18:31.373Z tags:advisory-prose,c4-reframe,cooperating-agent-guidance,smoke-test-batch-04,speculative-pick-refusal,tool-misframing -->
## Verify phase-dependency infrastructure in code before implementing a later-phase issue

**Before writing any code for a 'Phase N' or explicitly sequenced issue, grep for the concrete artifacts — type names, state-file paths, schema constants — that predecessor phases were supposed to create; if they are absent, push back regardless of the predecessor issue's open/closed label.**

**Why:** An issue can be marked open (or even closed) while the infrastructure it promised is still missing from the codebase. Implementing a later phase against empty infrastructure means every code path silently hits empty-state fallbacks, calibration thresholds are uninitialized, and the issue's own success metrics cannot be evaluated — producing code that is syntactically valid but semantically broken from day one.

**How to apply:** When an issue title or body contains 'Phase N', 'Step N', or an explicit 'depends on #X' line, (1) check the dependency issue's state, AND (2) grep for 2–3 key identifiers called out in the dependency — type names, file patterns, exported constants. If grep returns zero matches, the prerequisite has not landed.

**Tells:** Phase number in issue title; 'MUST land first' / 'depends on' language in body; state-file paths referenced by the new issue that nothing currently writes; schema type names with zero grep hits.

<!-- promote-candidate:phased-split -->
When a multi-phase feature set is implemented in separate issues, later phases routinely reference state files, schema types, and calibration constants that the earlier phase was supposed to create. Checking the predecessor issue status alone is insufficient — the actual file/type must be confirmed present in the codebase via grep before the later phase can produce correct behavior. Absent infrastructure causes silent empty-state fallbacks rather than compile errors, making the breakage hard to detect post-merge.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-51-54-224Z issue:#178 outcome:implement ts:2026-05-05T23:03:13.714Z tags:agent-memory-growth,data-layer-only,fail-soft-state,lesson-utility-scoring,phased-split,pushback-hook,stable-section-id,summarizer-hook -->
## Fail-soft wiring for state-collection hooks added to critical run paths

**Wrap every new `record*`/`persist*` call added to an orchestrator in a caught, log-only block — never let state-collection throw on the main run path.**

**Why:** File-lock contention, schema mismatch, or disk-full in a recording helper must not abort an in-flight issue run. One unguarded `await` added to `runIssueCore.ts` can silently kill sibling agent runs mid-flight. The utility record is observability data; the run result is not.

**How to apply:** Any time a Phase-N feature wires a new hook into an existing orchestrator, pattern is `try { await record(...) } catch (e) { logger.warn('record failed', e) }`. Never rethrow. Never propagate.

**Tells:** New "data layer only" phase; state file is gitignored (non-essential output); hook inserted alongside an existing summarizer-append or pushback call site.

<!-- promote-candidate:fail-soft-state -->
State-collection hooks wired into a shared orchestrator (runIssueCore.ts or equivalent) behave as fire-and-forget in practice: file-lock contention, schema mismatch, or disk-full errors in a recording helper must not propagate to the main run path. Losing one utility record is acceptable; aborting the run — and potentially cascading to sibling agents — is not. The pattern `try { await record(...) } catch (e) { logger.warn(...) }` at each call site is the minimal safe form.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-51-54-224Z issue:#179 outcome:pushback ts:2026-05-05T23:05:00.814Z tags:best-architectural-solution-discipline,context-cost-curve,operator-vs-agent-seam,phased-split,pre-dispatch-triage,research-study-scope -->
