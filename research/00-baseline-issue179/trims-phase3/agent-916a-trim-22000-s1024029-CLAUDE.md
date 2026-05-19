## Crypto/DeFi Transaction Preflight Checks
- Before preparing any on-chain tx, verify: native gas/bandwidth (TRX bandwidth on TRON), lending pause flags (`isWithdrawPaused` / `isSupplyPaused`), min borrow/supply thresholds, ERC-20 approval status.
- Never use `uint256.max` for collateral withdrawal — fetch the exact balance.
- Multi-step (approve + action): wait for the approval to confirm before sending the dependent tx.

## Tool Usage Discipline
- Don't repeat the same informational tool call within a single turn — cache mentally.
- Ambiguous / empty result: verify once with a different method; don't loop without user consent.

## SDK Scope-Probing Discipline
- **Scope-probe new third-party SDKs BEFORE committing the plan.** Invoke `rnd`. 15-30 min: `npm view <pkg>` for runtime deps + last-published; install into `/tmp/<pkg>-probe/`, read `dist/*.d.ts`; check transit graph for `*-contracts`, hardhat, ethersproject v5, parallel core libs; confirm the API exposes UNSIGNED tx output (Ledger-compatible), not internally-signing helpers.
- Document the verdict in the plan: SDK / version / red flags / decision (adopt / cherry-pick / skip).
- Cost of skipping: PR #334 adopted `@uniswap/v3-sdk`; shallow d.ts inspection missed the `swap-router-contracts → hardhat → solc/sentry/undici/mocha` transit graph that Snyk caught at PR-CI. ~2h refactor to drop the SDK and port the math to native bigint with fixture-locked bit-exactness.
- Reward: Phase 2/3 (Curve + Balancer) planning rejected `@curvefi/api` (ethers-coupled signing) and `@balancer-labs/sdk` V2 (ethersproject-bound, stale), accepted `@balancer/sdk` V3 (viem-native + V2 helpers). 1 SDK adopted instead of 3.

## Chat Output Formatting
- Markdown hyperlinks over raw URLs everywhere: `[label](url)`. Long URLs (swiss-knife decoders, Etherscan tx, tenderly/phalcon simulations) wrap the terminal into unreadable walls when raw. Apply in user replies AND in any text the server tells the agent to render. Raw URLs OK only when short and scannable (bare domains) or required for machine-readable JSON paste-blocks.

## Push-Back Discipline
- **Push back BEFORE acting if the request is built on a faulty premise that won't achieve the user's stated goal.** Mid-response caveats ("won't actually fix the thing you asked for") prove the wrong action got taken.
- Tells: re-running a workflow on a tag that predates the fix; re-broadcasting a tx with a confirmed nonce; wrapping a destructive action with "won't really do what you want, but doing it anyway".
- Format: one sentence on the mismatch + 2-3 alternatives + a question. Short — unblock the decision, don't lecture.
- If the user says "do it anyway", proceed.
- Past incident 2026-04-27: user asked to retrigger release-binaries.yml on the v0.9.4 tag for a missing macos-arm64 upload; tag predated #346 / #349 / #361 (size + retry fixes). Right move was flag the frozen-tag problem and recommend cutting v0.9.5.

## Issue Analysis
- **When asked to work on an issue, read the comments too — not just the body — and fold relevant content into the analysis.** Comments are where reviewers add follow-up scope, push back on the original framing, or specify defense layers the body left implicit. Skipping them ships a half-answer to the wrong question. `gh api repos/<owner>/<repo>/issues/<N>/comments` returns the thread.
- Past incident 2026-04-29: implemented #556 (burn-address approval refusal) from the body alone. The user's follow-up comment ("agent should route this through the approve tool, not prepare_custom_call") was the second defense layer the issue actually required — caught only after the user pointed it out, costing a round-trip.

## Smallest-Solution Discipline
- **Push back with the smallest solution that solves the stated problem.** Minimum change first; escalate only if it demonstrably doesn't cover the requirement. Issue/plan text is a problem description, not a license to build infrastructure.
- Tells the proposal is too big: persistence layer for a one-shot operation; new module when an inline call-site change would do; background worker/scheduler for an action that fires once per request; generalizing for hypothetical future callers; "while I'm here" refactors bundled into a fix PR.
- Format: smallest fix + what the larger proposal adds + which scope to pursue. If the issue/plan author specified the heavy approach, surface the lighter one explicitly — don't silently downscope either.
- If the user says the larger scope is intended, proceed.

## Install-State-Aware Recommendations
- **Before recommending a command that depends on how a tool is installed (npm-global vs local clone vs pipx vs system-package vs MCP-server registration), verify the actual install state first.** This is the `rnd` skill's "name the source before you name the fact" applied to recommendations: the source of truth is the user's actual installed state, not a plausible guess about how they installed it. One cheap read (`which <bin>`, `claude mcp get <name>`, `cat <config>`, `ls <expected dir>`) costs less than a command that silently switches the user off their dev build, points at the wrong binary, or installs a duplicate alongside the real one. Generalizes: any recommendation whose correctness depends on user-side state — shell, package manager, version, scope, env — verifies that state before naming the command.
- Tells you're about to recommend without verifying:
  - `npx -y <pkg>` for a tool the user runs from `node /path/to/dist/index.js`.
  - `pip install` when the user has it under pipx / conda / system-package.
  - `brew` on Linux, `apt` on macOS, or any pkg-manager that doesn't match the platform.
  - `claude mcp add <name>` without `claude mcp get <name>` first to capture existing scope, command, args, env.
  - `~/.bashrc` edits when the user runs zsh (or vice versa).
- Format: lead with one observation line ("`claude mcp get` shows scope=local, launches via `node /path/dist/index.js`, no env vars set"), then the command tailored to that state. The observation line lets the user catch mismatches you missed.
- Past incident 2026-04-29: drafted `claude mcp add vaultpilot-mcp --env SAFE_API_KEY=<key> -- npx -y vaultpilot-mcp` for a `SAFE_API_KEY` setup, assuming the published npm package. User actually runs a local dev clone at `/home/szhygulin/dev/recon-mcp/dist/index.js`. The recommended command would have switched their MCP off the dev build onto npm-latest, silently dropping unmerged local work. Caught only because the user asked for the exact command, forcing me to read `claude mcp get` first. Right move: read first, recommend second.

## Cross-cutting features need a layer-chain audit and phase split along the data-layer / integratio...

**Rule:** Cross-cutting orchestration / envelope / dedup / fee-rendering features touch a predictable plumbing chain that is consistently underestimated by 1.5–2×. Before dispatch, run a layer-chain audit; if ≥5–6 layers are implicated, propose a phased split along the natural seam, and gate Phase 1 so the merged artifact is a byte-identical no-op until Phase 2 wires activation.

**Canonical layer chain:** `types` → `state/schema` → `workflow logic` → `orchestrator` → `CLI wiring` → `tests`. Each layer typically adds one file, making stated '4–5 file' estimates low by 1.5–2× (the ×1.5 calibration multiplier).

**Past incidents:**
- Issue #134 (run 2026-05-05, workflow-threading auto-phase-followup; 6-layer chain surfaced under-stated file count).
- Issue #141 (run 2026-05-05, Phase 1 of multi-phase split landed as no-op via optional Zod fields + `autoPhaseFollowup` default-off guard).
- Issue #140 (run 2026-05-05, dedup feature with `--apply-dedup` destructive flag; 6–8 file layer chain hidden behind ~5-file scope).
- Issue #649 (run 2026-05-05, cost-preview multi-chain expansion; TRON net-burn enrichment forced a Phase 1 (render-and-wire) / Phase 2 (envelope schema extension + enrichment) split).

**Natural split seams (use the one that fits):**
- **Data-layer vs. integration-wiring** (general orchestration features): types + schema + render helpers in Phase 1; CLI + orchestrator + lifecycle hooks + tests in Phase 2.
- **Advisory-vs-mutation seam** (dedup-style features): Phase A = detection + advisory report only; Phase B = destructive close path behind a flag like `--apply-dedup`.
- **Envelope-vs-enrichment seam** (cost-preview / fee-rendering across chains): Phase 1 = render-and-wire against chains whose fee data already lives on the unsigned-tx envelope (`networkFee`, `priorityFee`, `feeEstimate`); Phase 2 = new envelope fields + enrichment math at build sites for chains needing on-chain computation.

**Why:**
- Issue authors enumerate the new logic file plus one or two call-sites; they consistently miss the integration glue at each layer boundary. The ×1.5 calibration multiplier reliably pushes stated ~5 counts past the 5-file dispatch threshold once every layer is counted.
- Mixing render-only chains with enrichment-heavy chains in one PR produces cross-cutting diffs across types / data-fetch / render / wiring / tests simultaneously — exactly the shape phased-split targets.
- Without a default-off Phase 1 gate, a missing CLI flag or unset config silently activates incomplete behavior before Phase 2 lands.

**How to apply:**
1. Count one file per layer actually touched against the canonical chain. If ≥5 layers (or ≥6 files for dedup-style features), treat the issue as 8+ files regardless of stated count.
2. For envelope/fee work: grep each chain's unsigned-tx envelope type for existing fee fields. Any chain missing a displayable fee field needs a schema-extension phase first.
3. Propose the appropriate phase split (data/integration, advisory/mutation, or envelope/enrichment) at the natural seam.
4. **Phase 1 implementation pattern (mandatory for safety):**
   - Add new Zod schema fields as `.optional()` (with URL or type validation as needed).
   - Guard every new render section behind a boolean `WorkflowVars` flag (e.g. `autoPhaseFollowup`) that nothing currently sets — no default or explicit `false`.
   - Write subtests for both the off-state (asserts baseline shape is byte-identical to pre-phase) and the on-state (asserts new section is present). Full suite must stay green in both states.
5. Defer activation path (CLI flag wiring, config plumbing) explicitly to a later issue.

**Domain-specific note (TRON / non-EVM fee rendering):** TRON cost-preview requires computing net burn after subtracting frozen-stake energy offsets. The raw `estimatedEnergyCostSun` value on the unsigned-tx envelope overstates actual user cost whenever the account holds frozen TRX for energy (common for active wallets). A derived `feeNetSun` field must be populated at tx-build sites via a `getAccountResource`-style call before the value reaches the render layer — display-time enrichment is too late because the resource query needs the sender address from build context.

**Tells (union):**
- Issue title contains 'auto-', 'wire', 'propagate', 'lifecycle', 'phase', 'Phase 1', 'no CLI yet', or 'data layer only'.
- Touches CLI flag AND types AND workflow AND orchestrator simultaneously.
- Issue mentions 'close duplicates', 'skip if already seen', 'pre-dispatch', or an `--apply-*` destructive flag.
- Issue lists 3+ chains; at least one is TRON or uses staked-resource accounting; the others already carry a numeric fee on their envelope type.
- Stated file count ≤ 5 but the feature is cross-cutting through the orchestration stack.
- Scope notes explicitly defer activation path to a later issue.
- Prior splits with the same shape (data → integration) have succeeded.
<!-- run:run-2026-05-05T17-57-44-626Z issue:#150 outcome:implement ts:2026-05-05T18:03:31.335Z tags:data-layer-only,dedup,fail-soft,llm-call,orchestrator-llm-call,phased-split,schema-extension,zod-schema-extension -->
## Verify the authoritative type file before editing the path named in an issue body

**When an issue body names a specific file for a schema or interface change, search for the actual type/interface definition before editing — the named file may only import and consume the type.** The authoritative definition may live elsewhere (e.g., `types.ts` vs. a domain-specific state file).
**Why:** Issue bodies are written at planning time and can lag behind refactors; `RunState` was described as living in `src/state/runState.ts` but was actually defined in `src/types.ts` — editing the consumer file would have left the interface unchanged.
**How to apply:** On every schema-extension or interface-addition task, grep or use `go-to-definition` for the type name before writing any edit. Edit only the file that _declares_ the type; files that merely import it need no change.
**Tells:** Issue body cites a concrete file path for a type/interface change; codebase has both a `types.ts` and domain-specific state/schema files; the named file imports from `types.ts`.

<!-- promote-candidate:schema-extension -->
Issue bodies naming a concrete file for a type/interface change can lag behind refactors. In this codebase, `RunState` was described as living in `src/state/runState.ts` but was actually defined in `src/types.ts`; `runState.ts` only imported and consumed it. Editing the consumer file would have left the interface unchanged. Searching for the actual type definition before any schema-extension edit is the reliable approach.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T20-22-10-610Z issue:#158 outcome:pushback ts:2026-05-05T20:25:42.364Z tags:advisory-vs-mutation-seam,agent-memory-growth,best-architectural-solution-discipline,claude-md-compaction,mechanism-ambiguity,phased-split,pre-dispatch-triage,scope-fit-check,splitter-section-floor -->
## Issues listing multiple competing mechanisms without selection need design clarification before dispatch

**When an issue names ≥2 candidate implementation mechanisms without choosing one, block dispatch and request mechanism selection first.**

**Why:** Scoping a multi-mechanism issue forces evaluation of every branch — inflating estimates and risking budget on a discarded approach. The cost multiplier (×1.5 calibration) compounds further when each mechanism spans a different layer-chain; only one mechanism will ever ship.

**How to apply:** During pre-dispatch triage, look for hedging patterns in the approach or design section: 'option A/B/C', 'alternatively', 'three candidate mechanisms'. Push back asking for a single mechanism to be selected, then re-triage scope from scratch with only that mechanism in view.

**Tells:** 'we could X or Y or Z'; multiple sub-headings each describing a different approach; no explicit 'chosen approach' callout in the issue body.

**Corollary:** When the issue also contains an isolatable small bug (e.g., a threshold-mismatch) alongside the under-specified feature, advise the author to file the bug as a separate issue so it can ship immediately while the design question is resolved.

<!-- promote-candidate:pre-dispatch-triage -->
Issues that list multiple competing implementation mechanisms (e.g., 'we could prune, OR score, OR LLM-merge') without selecting one tend to produce inflated scope estimates because every mechanism branch must be considered independently. In at least one observed case the layer-chain audit per mechanism was 6 files each, but only one mechanism would ever be implemented — meaning a large fraction of estimation work was waste. Separating the design-selection step (which mechanism?) from the implementation-scope step (how many files, what calibration?) keeps triage accurate and avoids dispatching an agent toward a discarded approach.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T20-46-43-739Z issue:#158 outcome:implement ts:2026-05-05T20:53:19.468Z tags:advisory-vs-mutation-seam,agent-memory-growth,claude-md-compaction,collapsed-distinct-rules-validator,llm-merge-proposal,phased-split,splitter-section-floor,zod-schema-extension -->
## Diagnose CLAUDE.md growth shape before choosing splitter vs compactor

**When CLAUDE.md has ≤4 sections but individual sections are accreting rules, the splitter is the wrong tool — route to compaction-via-merge instead.**
**Why:** The splitter resolves horizontal overload (distinct sub-specialties → sibling agents); it cannot act on vertical growth (depth within one coherent specialty). Applying the splitter to the wrong shape produces spurious sibling agents with no real scope boundary.
**How to apply:** Before invoking the splitter, check whether active section count clears the splitter-section-floor threshold; if it does not, route to `compact-claude-md` (advisory) first.
**Tells:** `agent-memory-growth` or `claude-md-compaction` tags active; CLAUDE.md has ≤4 sections but individual sections exceed line or rule-count budgets.

**LLM merge proposals must pass a collapsed-distinct-rules check before surfacing — flag any cluster whose merge would drop a past-incident date.**
**Why:** A `Why:` line containing a date or issue reference is episodic memory that justifies the rule's existence; silent loss during compaction lets a future agent re-learn the same lesson expensively.
**How to apply:** Run the validator immediately after parsing the Zod-validated LLM response; surface per-cluster warnings, not a hard abort — the operator decides whether the drop is acceptable.

<!-- promote-candidate:claude-md-compaction -->
CLAUDE.md growth has two distinct shapes: section-count growth (many distinct sub-specialties accumulate → splitter resolves it by creating sibling agents) and section-depth growth (≤4 sections are internally dense for one coherent specialty → splitter cannot help). LLM merge proposals for the depth shape carry a hidden risk: silently dropping `Why:` lines that contain dates or issue references, which are episodic anchors justifying rule existence. Flagging these per-cluster rather than aborting lets operators decide intentionally.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-03-52-041Z issue:#167 outcome:implement ts:2026-05-05T22:06:16.655Z tags:claude-md-compaction,heading-max,production-data-clamp-overrun,single-source-of-truth-const,thesis-summary-heading -->
## Fail-soft wiring for state-collection hooks added to critical run paths

**Wrap every new `record*`/`persist*` call added to an orchestrator in a caught, log-only block — never let state-collection throw on the main run path.**

**Why:** File-lock contention, schema mismatch, or disk-full in a recording helper must not abort an in-flight issue run. One unguarded `await` added to `runIssueCore.ts` can silently kill sibling agent runs mid-flight. The utility record is observability data; the run result is not.

**How to apply:** Any time a Phase-N feature wires a new hook into an existing orchestrator, pattern is `try { await record(...) } catch (e) { logger.warn('record failed', e) }`. Never rethrow. Never propagate.

**Tells:** New "data layer only" phase; state file is gitignored (non-essential output); hook inserted alongside an existing summarizer-append or pushback call site.

<!-- promote-candidate:fail-soft-state -->
State-collection hooks wired into a shared orchestrator (runIssueCore.ts or equivalent) behave as fire-and-forget in practice: file-lock contention, schema mismatch, or disk-full errors in a recording helper must not propagate to the main run path. Losing one utility record is acceptable; aborting the run — and potentially cascading to sibling agents — is not. The pattern `try { await record(...) } catch (e) { logger.warn(...) }` at each call site is the minimal safe form.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-51-54-224Z issue:#179 outcome:pushback ts:2026-05-05T23:05:00.814Z tags:best-architectural-solution-discipline,context-cost-curve,operator-vs-agent-seam,phased-split,pre-dispatch-triage,research-study-scope -->
## Research-study execution issues are operator/agent-seam mismatches — push back with a phase split

**Rule:** When an issue's core deliverables are "raw per-run measurements" or "fitted curves" produced by running N-agent × M-issue studies with operator-judged scoring, classify the whole issue as an operator/agent-seam mismatch and push back with a concrete three-way split before touching any code.

**Why:** A single coding agent has no authority to invoke the orchestrator against sibling forks and cannot perform the human-side scoring rubrics needed to label pushback accuracy. Attempting partial delivery produces phantom measurements or silent scope collapse.

**How to apply:** Triggers when (a) estimated study cost >> remaining agent budget by ≥10×, AND (b) deliverables include empirical measurements that require actual multi-agent runs or operator-judged labels. Propose: Phase A — agent builds harness/methodology/util skeleton with a STUDY_PENDING placeholder; Phase B — operator runs the study manually; Phase C — a tiny follow-up issue encodes the results.

**Tells:** Issue title contains "measure", "curve", or "calibrate"; body lists "raw per-run measurements" or "fitted" values; estimated execution cost is $50–$200 while agent budget is $1–$5.

<!-- promote-candidate:research-study-scope -->
Issues framed as "measure X curve at Y sizes" or "calibrate Z factor against outcome-quality" typically require:
- Repeated orchestrator invocations across many agent forks (cost $50–$200 for a 7-size × 10-issue study)
- Operator-side scoring rubrics that no single agent can self-evaluate
- A phase split: agent builds the harness/skeleton (agent-doable), operator runs the study (operator-side), follow-up issue encodes results (agent-doable)
Attempting full delivery in one agent run produces either phantom measurements or silent scope collapse.
<!-- /promote-candidate -->

