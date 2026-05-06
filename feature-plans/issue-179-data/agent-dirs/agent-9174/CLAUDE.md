## Crypto/DeFi Transaction Preflight Checks
- Before preparing any on-chain tx, verify: native gas/bandwidth (TRX bandwidth on TRON), lending pause flags (`isWithdrawPaused` / `isSupplyPaused`), min borrow/supply thresholds, ERC-20 approval status.
- Never use `uint256.max` for collateral withdrawal — fetch the exact balance.
- Multi-step (approve + action): wait for the approval to confirm before sending the dependent tx.
## Git/PR Workflow
- PR-based always. Never push to `main` or to the wrong branch.
- Confirm with the user before force-pushing or rebasing a pushed branch. `--force-with-lease` only on feature branches; never plain `--force`, never on `main`.
- **One worktree per feature/fix** under `.claude/worktrees/<branch-name>`. Never edit in the main worktree at `/home/szhygulin/dev/recon-mcp` — parallel agents race the index, working tree, and `node_modules`. Recipe: `cd /home/szhygulin/dev/recon-mcp && git fetch origin main && git worktree add .claude/worktrees/<short-name> -b <branch-name> origin/main`. Exceptions: `claude-work/` (gitignored) and `~/.claude/projects/.../memory/` (per-user) are editable from anywhere.
- **`cd /home/szhygulin/dev/recon-mcp` BEFORE every `git worktree add`** — the recipe path is relative. From a previous worktree, the new one silently nests at `<prior>/.claude/worktrees/<new>` and every `git status` / build / push afterwards runs against a confused tree. Run `pwd` after the cd if uncertain. Past incidents 2026-04-28: SunSwap → readme-roadmap, pnl-mtd → claude-md-close-keyword.
- **Sync to `origin/main` before starting any work** (`git fetch origin main && git rebase origin/main`). Stale main causes spurious conflicts and risks overlap with another agent's in-flight change. New worktrees from the recipe start at fresh main — still run it; consistency beats remembering when it matters. Re-rebasing a pushed/PR-open branch needs user confirmation.
- **Branch every new PR off `origin/main` — never stack PRs**, even when two in-flight PRs touch shared registration files (`src/index.ts` imports + `registerTool`, `src/modules/execution/index.ts` exports, `src/modules/execution/schemas.ts` zod inputs). Second-to-merge resolves at PR time: rebase after the prior lands, fix conflicts, `--force-with-lease`. Stacking creates fragile queues — base squash-merges orphan downstream; out-of-order merges break the chain.
- **Don't watch CI unless asked.** After push: report the PR as a Markdown hyperlink (`[#553](url)` or `[PR title](url)` — never the raw URL) + one-line summary, then stop. Same rule applies any time a fresh PR / issue / release is created: link it via `[label](url)`, not bare `https://…`. If asked to watch: `gh pr checks <PR>` or `gh run watch <id> --exit-status`. Most runs 1–3 min; release workflows (npm + MCP Registry) 90s–2min. Past ~5 min over typical → assume stuck runner: `gh run rerun <id> --failed` or push an empty commit for a fresh `synchronize`.
- **PR body must use `Closes #N` paired directly with the issue number.** GitHub's parser only fires when the keyword (`Closes` / `Fixes` / `Resolves`) is bound to `#N`. Works: `Closes #432.`; `Closes part of #439 — the gap`. Doesn't: `Closes the smoke-test gap` (keyword bound to prose); `feat(x): add Y (#447)` in title (parenthetical, not close keyword). Lead the PR body with `Closes #N` on its own line. PR #525 merged but #447 stayed open due to bare prose `#447` references.
## Tool Usage Discipline
- Don't repeat the same informational tool call within a single turn — cache mentally.
- Ambiguous / empty result: verify once with a different method; don't loop without user consent.
## SDK Scope-Probing Discipline
- **Scope-probe new third-party SDKs BEFORE committing the plan.** Invoke `rnd`. 15-30 min: `npm view <pkg>` for runtime deps + last-published; install into `/tmp/<pkg>-probe/`, read `dist/*.d.ts`; check transit graph for `*-contracts`, hardhat, ethersproject v5, parallel core libs; confirm the API exposes UNSIGNED tx output (Ledger-compatible), not internally-signing helpers.
- Document the verdict in the plan: SDK / version / red flags / decision (adopt / cherry-pick / skip).
- Cost of skipping: PR #334 adopted `@uniswap/v3-sdk`; shallow d.ts inspection missed the `swap-router-contracts → hardhat → solc/sentry/undici/mocha` transit graph that Snyk caught at PR-CI. ~2h refactor to drop the SDK and port the math to native bigint with fixture-locked bit-exactness.
- Reward: Phase 2/3 (Curve + Balancer) planning rejected `@curvefi/api` (ethers-coupled signing) and `@balancer-labs/sdk` V2 (ethersproject-bound, stale), accepted `@balancer/sdk` V3 (viem-native + V2 helpers). 1 SDK adopted instead of 3.
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
## Issue Analysis
- **When asked to work on an issue, read the comments too — not just the body — and fold relevant content into the analysis.** Comments are where reviewers add follow-up scope, push back on the original framing, or specify defense layers the body left implicit. Skipping them ships a half-answer to the wrong question. `gh api repos/<owner>/<repo>/issues/<N>/comments` returns the thread.
- Past incident 2026-04-29: implemented #556 (burn-address approval refusal) from the body alone. The user's follow-up comment ("agent should route this through the approve tool, not prepare_custom_call") was the second defense layer the issue actually required — caught only after the user pointed it out, costing a round-trip.
## Cross-Repo Scope Splits
- **When an issue's solution splits between MCP code and skill rendering / agent-flow guidance, file the skill half as a tracked issue in [`vaultpilot-security-skill`](https://github.com/szhygulin/vaultpilot-security-skill) before merging the MCP PR — and link both ways.** "Skill-side, out of scope" buried in a PR-description bullet drops the work. A real issue with the proposed rules + explicit scope statement keeps it visible and lets the skill repo pull it in on its next release.
- Tells the split is happening: the issue's suggested fix names a tool the MCP doesn't expose (`list_contacts(label=…)` re-derivation before a non-recipient-parameter tool); the proposed defense is "agent should call X first" (skill rules bind cooperating agents); the proposed defense is "emit a CHECKS PERFORMED block listing …" (skill renders the block, not the MCP).
- Format for the skill issue: link the MCP issue + PR; one-paragraph context on what MCP-side shipped; the proposed rules in numbered sections; explicit scope label "cooperating-agent guidance only — rogue agent ignores any rule" (per Rogue-Agent-Only Finding Triage).
- Past application 2026-04-29: vaultpilot-mcp#557 (share_strategy / import_strategy bypass preflight Step 0). MCP-side ship: strict-shape gate ([PR #571](https://github.com/szhygulin/vaultpilot-mcp/pull/571)). Skill-side filed at [vaultpilot-security-skill#23](https://github.com/szhygulin/vaultpilot-security-skill/issues/23) — list_contacts re-derive, CHECKS PERFORMED, schema-relay refusal as defense in depth.
## Smallest-Solution Discipline
- **Push back with the smallest solution that solves the stated problem.** Minimum change first; escalate only if it demonstrably doesn't cover the requirement. Issue/plan text is a problem description, not a license to build infrastructure.
- Tells the proposal is too big: persistence layer for a one-shot operation; new module when an inline call-site change would do; background worker/scheduler for an action that fires once per request; generalizing for hypothetical future callers; "while I'm here" refactors bundled into a fix PR.
- Format: smallest fix + what the larger proposal adds + which scope to pursue. If the issue/plan author specified the heavy approach, surface the lighter one explicitly — don't silently downscope either.
- If the user says the larger scope is intended, proceed.
## Rogue-Agent-Only Finding Triage
- **When the threat is "rogue agent generates harmful advisory text" or "rogue agent fabricates/suppresses MCP results" with no signing flow, close as architectural — don't ship MCP/skill mitigations pretending to fix it.** The skill is text in the agent's context; a hostile agent reads any rule and ignores it. Real defenses live at model-safety-tuning (Anthropic) or chat-client output-filter (Claude Code / Cursor / Desktop) — neither in scope here.
- Tells: output is purely advisory text (no `prepare_*` / `preview_send` / `send_transaction`); agent fabricates a security UI (fake `CHECKS PERFORMED` with `{✓}` verdicts); agent suppresses or falsifies MCP results; proposed fix is "add a rule to SKILL.md" with no other layer.
- **Don't confuse with rogue-MCP + cooperating-agent (Role B).** Skill rules genuinely bind a cooperating agent; read-only response-spoofing, fabricated `compare_yields` rows are real targets for skill-side guidance.
- **Don't confuse with device-layer architectural** (e.g. Ledger blind-sign) — different escalation path (vendor, not model/UI safety).
- Closing template: brief comment naming the architectural gap, citing #536 (canonical) + vaultpilot-mcp-smoke-test#21 (Role A scope-reframing methodology), one-line recap of why skill rules don't help.
- Cooperating-agent guidance with an explicit honest scope label IS acceptable (skill v0.7.0 / vaultpilot-security-skill PR #20). The rule above forbids dressing it up as a defense against the rogue case it isn't actually defending — security theater. Scope label "guides cooperating agents; does NOT defend against a rogue agent that ignores it" must be in the rule body, not just the PR description.
## Security Documentation Vocabulary
- **In user-facing docs (PR descriptions, SECURITY.md, README threat-model sections, issue-close comments), use established security-engineering vocabulary** — not informal "honest threat model" / "honest scope label". Professional readers parse "honest" as a credibility claim, not a technical property.
- Substitutions:
  - "Honest about what we can't defend" → **"residual risk"** / a **"Limitations"** section.
  - "Honest scope label" → **"explicit scope statement"** / **"explicit assumptions"** with in-scope vs. out-of-scope named.
  - "Honest threat model" → **"comprehensive"** (covers attack surface), **"rigorous"** (STRIDE/PASTA/attack trees), or **"documented"**.
  - "When the agent / MCP is honest" → **"cooperating agent"** / **"honest-MCP threat model"** (contrast with compromised). Umbrella: **compromise model** — what each component does when attacker-controlled.
- Cheatsheet: **trust boundary**, **defense in depth**, **fail-safe defaults** (uncertainty defaults to denial), **attack surface**, **threat actor** / **adversary model**, **tamper-evident** / **-resistant** / **-proof** (Ledger is tamper-resistant; skill-pin SHA gives tamper-evidence), **cryptographic integrity** (`payloadFingerprint`, skill-pin SHA, BIP-143 sighashes — name it).
- Scope: user-facing docs only. Internal plans, memory, chat replies, commit messages can stay informal.
- No churn PRs to bulk find-and-replace existing usages — migrate opportunistically.
## Documentation Style — concise, non-redundant, sharp
- **In user-facing docs (READMEs, AGENTS.md, INSTALL, prose sections of SECURITY.md, ROADMAP, AND CLAUDE.md itself), state each idea once, in its most natural place.** Long docs accumulate redundancy as features land incrementally — taglines, callouts, intro paragraphs, and feature bullets all end up restating the same pitch because each was written in isolation.
- Tells: same fact in 3+ places; intro region with tagline + callout + multi-paragraph "what this is" (pick one); tool descriptions explaining what the name implies; bullet lists duplicating prose immediately above; "Limitations" sections re-covering body ground.
- Apply at write time:
  - Lead with the strongest sentence. Don't ramp up.
  - One fact, one home — link from secondary locations instead of duplicating.
  - Cut adjectives that don't change meaning ("comprehensive" / "robust" / "powerful" / "seamless").
  - Tool/feature descriptions: state what's NON-obvious from the name; otherwise just list the name.
  - **Stay high-level. Don't over-explain.** Prefer one sharp sentence over an explanatory paragraph; one canonical example over four; a brief reference over a transcript. Readers can ask follow-ups; they cannot un-read filler. Factual accuracy is non-negotiable — high-level is fine, vague-bordering-on-wrong is not. If you're tempted to add a third example "for clarity," the first two were probably enough.
- Apply at edit time:
  - Read top-to-bottom; flag every sentence you've read before. Keep the best location, delete the rest, link if navigation value is lost.
  - Opportunistic dedup is fine while editing for another reason. Standalone churn PRs aren't.
- Scope: user-facing docs and PR descriptions. Internal plans, memory, code comments, chat replies can stay verbose.
- Past incident 2026-04-28: README grew to 258 lines with the intro restated four times, Solana durable-nonce in three sections, WC-Tron/Solana fact in two. Rewrite cut to 227 without losing technical content. CLAUDE.md rewritten same day from 110 to 103 by trimming filler — dense rule content compresses less than feature/marketing prose.
- **Don't re-explain synonyms.** Once a term is named clearly, don't paraphrase it in the next sentence "for clarity" — readers parse repetition as either condescension or signal that the first phrasing was wrong. Pick the strongest term, use it, move on.
<!-- run:merge-2026-05-05T21-49-44-518Z issue:#583+#595 outcome:compacted ts:2026-05-05T21:49:44.519Z -->
## Advisory-prose security findings with no named MCP tool surface are architectural residual risk —...

**Rule:** When a `security_finding` targets harmful content that lives only in agent-generated free-text prose — typosquat URLs, fabricated recovery contacts, phishing text, misleading instructions — and the issue body names no `prepare_*`, `preview_*`, signing, or other MCP tool call as the emission/sanitization point, push back as architectural residual risk. Do not investigate or attempt a code fix.

**Past incidents:** issue #595 (run 2026-05-01, advisory-prose typosquat); issue #595 (run 2026-05-05, repeat of same class); issue #583 (run 2026-05-05, hallucinated download URLs / fake recovery contacts).

**Why:**
- The MCP server only controls flow through tool boundaries; it has no trust boundary over prose the LLM emits directly and cannot intercept or sanitize advisory text.
- The correct defense layer is the chat-client output filter, model-safety tuning, upstream content policy, or the advisory-generating cooperating-agent skill — all out of scope for vaultpilot-mcp.
- Accepting such issues as in-scope creates unbounded work, sets false precedent that this class belongs to the MCP layer, and produces pseudo-fixes (prompt snippets, schema fields) that yield false confidence without closing the actual attack surface. A canonical prior closure already establishes the pattern; re-litigating the architecture per report is wasteful.

**How to apply:**
1. On any `security_finding` / `advisory-prose` / `typosquat` / `fake-recovery-contacts` issue, first ask: does the harmful payload traverse a named MCP tool call?
2. If no tool is implicated, search closed issues for the earliest canonical architectural-residual-risk disposition for this class.
3. Post a pushback comment that includes:
   - reference to that canonical prior closure (do not re-argue the architecture from scratch),
   - the correct defense layer named explicitly (chat-client output filter / model-safety tuning / upstream content policy / cooperating-agent skill),
   - concrete re-scope alternatives that *would* implicate a real tool surface — at minimum: (1) a named MCP tool surface through which the harmful content travels, (2) a meta-tracker, (3) an honestly-scoped cooperating-agent skill guidance with explicit scope statement.
4. Offer re-scope only if the reporter identifies a specific MCP tool surface; otherwise close as architectural residual risk.

**Tells (union):**
- Issue body names "chat output filter," "chat client," "model safety," or "no MCP defense applies" as the fix location.
- No `prepare_*` / `preview_*` / signing tool is mentioned as the emission point.
- Issue body cites advisory cell IDs (e.g. `expert-xNNN-A.5`) or describes malicious URLs in free-text prose rather than in structured transaction fields.
- Labels include `advisory-prose`, `typosquat`, `fake-recovery-contacts`, or `rogue-agent-triage`, often co-occurring with `security_finding`.
<!-- run:run-2026-05-02T06-32-08-433Z issue:#41 outcome:implement ts:2026-05-02T06:35:22.666Z -->
## Write audit-trail companion fields atomically with the state-transition flag that triggers them

**When a mutation flips a boolean state flag (`archived`, `completed`, `deleted`, etc.), always write every companion audit field (`archivedAt`, `splitInto`, `reason`, related-ID arrays) in the exact same transaction or mutation block — never leave them for a follow-up write.**

**Why:** A flag-only write creates a permanently incomplete audit trail: the registry can answer 'was this archived?' but not 'when?' or 'into what?'. Backfilling after the fact is lossy and the gap is invisible until a consumer tries to query the companion fields.

**How to apply:** Before closing any state-transition mutation, scan the target schema for fields named `*At`, `*By`, `*Into`, `*From`, `*Reason`, or sibling ID arrays. If the flag is being set but its companions are not, extend the same mutation to include them.

**Tells:** A schema has a boolean like `archived?: boolean` next to `archivedAt?: string` or `splitInto?: string[]`. Only the boolean is being written. The companion fields are either missing from the schema entirely or present but never populated.

**Also:** Issue descriptions may misstate the current schema — always read the actual source files before assuming fields exist. Add missing fields as optional (`?`) to preserve back-compat with pre-transition records already in the registry.
<!-- run:run-2026-05-05T16-33-14-458Z issue:#131 outcome:implement ts:2026-05-05T16:43:01.731Z tags:cost-surface,in-flight-signals,jsonl-log-parser,live-progress,operator-tooling,run-state-schema,status-cli -->
## Operator ad-hoc scripts against raw state/log files are a CLI UX gap to fill natively

**When operators are repeatedly hand-rolling scripts (python one-liners, grep/jq pipelines) against raw `state/*.json` or `logs/*.jsonl` artifacts to answer a common question, that is a direct signal to enrich the relevant CLI subcommand — not to document the workaround.**

**Why:** Issue originated from operators re-writing the same progress-query scripts every time someone asked "what is the run doing?". The fix — computing cost burn, per-issue tool counts, and a recent-events tail natively in `vp-dev status` — permanently removed the need for ad-hoc scripting and made the data discoverable.

**How to apply:** When an issue title/description contains phrases like "requires custom scripts", "output is too thin", or "hand-rolling against state files", prefer extending the existing CLI subcommand over adding documentation of the workaround. Compute the new data in a **pure, independently-testable helper** (e.g. `runActivity.ts`) so it is easy to unit-test without spawning the full orchestrator.

**Tells:** issue labelled bug+enhancement together; operators querying `.json`/`.jsonl` files directly; phrases like "one-liner", "custom script", "vp-dev ... too thin".

**Implementation pattern:**
- Persist derived metrics (e.g. `costAccumulatedUsd`) into `RunState` at every `saveRunState` callsite so the CLI reads a single source of truth.
- Expose time-varying data via `--watch` on the same subcommand rather than a new command.
- Gate new fields on existence (graceful no-op when the log or state file predates the feature).

<!-- promote-candidate:operator-tooling -->
When operators of a dev-agent system routinely write ad-hoc scripts (python one-liners, grep/jq) against raw state JSON or JSONL log files to answer common operational questions ("what is the run doing?", "how much has been spent?"), this pattern recurs across projects and domains. The sustainable fix is to (a) persist the computed metric into the persisted run-state object at every save-calls
[…truncated]
<!-- run:merge-2026-05-05T21-49-44-518Z issue:#134+#140+#141+#649 outcome:compacted ts:2026-05-05T21:49:44.519Z -->
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
<!-- run:run-2026-05-05T22-51-54-224Z issue:#180 outcome:pushback ts:2026-05-05T22:53:39.411Z tags:advisory-vs-mutation-seam,agent-memory-growth,claude-md-compaction,dependency-ordering,phased-split,pre-dispatch-triage -->
## Verify phase-dependency infrastructure in code before implementing a later-phase issue

**Before writing any code for a 'Phase N' or explicitly sequenced issue, grep for the concrete artifacts — type names, state-file paths, schema constants — that predecessor phases were supposed to create; if they are absent, push back regardless of the predecessor issue's open/closed label.**

**Why:** An issue can be marked open (or even closed) while the infrastructure it promised is still missing from the codebase. Implementing a later phase against empty infrastructure means every code path silently hits empty-state fallbacks, calibration thresholds are uninitialized, and the issue's own success metrics cannot be evaluated — producing code that is syntactically valid but semantically broken from day one.

**How to apply:** When an issue title or body contains 'Phase N', 'Step N', or an explicit 'depends on #X' line, (1) check the dependency issue's state, AND (2) grep for 2–3 key identifiers called out in the dependency — type names, file patterns, exported constants. If grep returns zero matches, the prerequisite has not landed.

**Tells:** Phase number in issue title; 'MUST land first' / 'depends on' language in body; state-file paths referenced by the new issue that nothing currently writes; schema type names with zero grep hits.

<!-- promote-candidate:phased-split -->
When a multi-phase feature set is implemented in separate issues, later phases routinely reference state files, schema types, and calibration constants that the earlier phase was supposed to create. Checking the predecessor issue status alone is insufficient — the actual file/type must be confirmed present in the codebase via grep before the later phase can produce correct behavior. Absent infrastructure causes silent empty-state fallbacks rather than compile errors, making the breakage hard to detect post-merge.
<!-- /promote-candidate -->
